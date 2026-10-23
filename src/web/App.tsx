import { useEffect, useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { EcraAdmin } from './ecra-admin.js';
import { EcraPublica } from './ecra-publica.js';
import { EcraConvidados } from './ecra-convidados.js';
import { EcraDados } from './ecras-dados.js';
import { EcraLegal, EcraNovosTermos } from './ecras-legal.js';
import { EcraFornecedores } from './ecra-fornecedores.js';
import { EcraMarca } from './ecra-marca.js';
import { EcraMesas } from './ecra-mesas.js';
import { EcraOrcamento } from './ecra-orcamento.js';
import { EcraRsvp } from './ecra-rsvp.js';
import { EcraDoisFactores } from './ecras-dois-factores.js';
import { EcraConvite, EcraEquipa } from './ecras-equipa.js';
import { EcraProjecto } from './ecra-projecto.js';
import { EcraNovoProjecto } from './ecras-projectos.js';
import { EcraMudarPalavraPasse, EcraRecuperar, EcraRedefinir } from './ecras-palavra-passe.js';
import { EcraConfirmarEmail, EcraEntrar, EcraInicio, EcraRegisto } from './ecras.js';
import { navegar, useCaminho } from './navegacao.js';

// Os tokens das ligações enviadas por e-mail são lidos à entrada e tirados do endereço, para não ficarem
// no histórico do browser. Ficam guardados neste separador (sessionStorage), para que recarregar a
// página (ex.: puxar para baixo no Android) não perca a ligação.
function lerToken(caminho: string): string {
  if (location.pathname !== caminho) return '';
  const chave = `eveni-token:${caminho}`;
  const doEndereco = new URLSearchParams(location.search).get('token');
  history.replaceState(null, '', caminho);
  try {
    if (doEndereco) sessionStorage.setItem(chave, doEndereco);
    return doEndereco ?? sessionStorage.getItem(chave) ?? '';
  } catch {
    return doEndereco ?? '';
  }
}

function esquecerToken(caminho: string) {
  try {
    sessionStorage.removeItem(`eveni-token:${caminho}`);
  } catch {
    // sem armazenamento disponível: nada a esquecer
  }
}
const tokenConfirmacao = lerToken('/confirmar-email');
const tokenRedefinir = lerToken('/redefinir-palavra-passe');
const tokenConvite = lerToken('/convite');
const tokenRsvp = lerToken('/rsvp');

// O convite fica guardado neste separador enquanto a pessoa entra ou cria conta, para voltar a ele.
function conviteGuardado(): string {
  try {
    return sessionStorage.getItem('eveni-token:/convite') ?? '';
  } catch {
    return '';
  }
}

// Ecrãs só para quem não tem sessão, e ecrãs acessíveis com ou sem sessão.
const SO_ANONIMO = new Set(['/entrar', '/registo', '/recuperar']);
const QUALQUER = new Set(['/confirmar-email', '/redefinir-palavra-passe', '/convite', '/rsvp', '/privacidade', '/termos']);

type Estado = { tipo: 'a-carregar' } | { tipo: 'anonimo' } | { tipo: 'com-sessao'; eu: Eu };

export function App() {
  const caminho = useCaminho();
  const [estado, setEstado] = useState<Estado>({ tipo: 'a-carregar' });
  // Mensagem a mostrar no ecrã de entrada (ex.: depois de eliminar a conta).
  const [avisoEntrada, setAvisoEntrada] = useState<string>();

  function carregarEu() {
    api<Eu>('GET', '/api/auth/eu')
      .then((eu) => setEstado({ tipo: 'com-sessao', eu }))
      // Sem sessão (401) ou sem ligação: mostrar o ecrã de entrada.
      .catch(() => setEstado({ tipo: 'anonimo' }));
  }

  useEffect(carregarEu, []);

  useEffect(() => {
    if (QUALQUER.has(caminho)) return;
    // Sem sessão, o endereço principal mostra a página pública (decisão 028); os outros levam à entrada.
    if (estado.tipo === 'anonimo' && !SO_ANONIMO.has(caminho) && caminho !== '/') navegar('/entrar');
    if (estado.tipo === 'com-sessao' && SO_ANONIMO.has(caminho)) navegar(conviteGuardado() ? '/convite' : '/');
  }, [estado, caminho]);

  const entrou = (eu: Eu) => {
    // O aviso (ex.: "conta eliminada") só se mostra uma vez.
    setAvisoEntrada(undefined);
    setEstado({ tipo: 'com-sessao', eu });
  };

  // A página de RSVP é do convidado: não depende de ter (ou não) conta no Eveni.
  if (caminho === '/rsvp') return <EcraRsvp token={tokenRsvp} />;
  // Os termos e a política de privacidade lêem-se sem sessão (antes de criar conta, ou a partir do RSVP).
  if (caminho === '/privacidade') return <EcraLegal tipo="privacidade" />;
  if (caminho === '/termos') return <EcraLegal tipo="termos" />;
  if (estado.tipo === 'a-carregar') {
    return <p className="a-carregar">{mensagens.ecras.carregar}</p>;
  }
  if (caminho === '/redefinir-palavra-passe') {
    return (
      <EcraRedefinir
        token={tokenRedefinir}
        aoAlterar={() => {
          esquecerToken('/redefinir-palavra-passe');
          // O servidor terminou as sessões desta conta; se o browser tinha sessão de outra conta, mantém-se.
          carregarEu();
        }}
      />
    );
  }
  if (estado.tipo === 'com-sessao' && estado.eu.termosPorAceitar && caminho !== '/conta/dados') {
    // Termos novos por aceitar (decisão 026): só se pode aceitar, sair, ou ir aos dados para os levar ou apagar.
    return (
      <EcraNovosTermos
        aoAceitar={entrou}
        aoSair={() => {
          esquecerToken('/convite');
          setEstado({ tipo: 'anonimo' });
          // Quem acabou de sair volta à entrada, não à página pública.
          navegar('/entrar');
        }}
      />
    );
  }
  if (caminho === '/convite') {
    return (
      <EcraConvite token={conviteGuardado() || tokenConvite} comSessao={estado.tipo === 'com-sessao'} aoTerminar={() => esquecerToken('/convite')} />
    );
  }
  if (caminho === '/confirmar-email') {
    // A confirmação exige sessão na conta que recebeu o e-mail (ver servidor): entrar primeiro.
    if (estado.tipo === 'anonimo') return <EcraEntrar aoEntrar={entrou} aviso={mensagens.ecras.confirmar.entrarPrimeiro} />;
    return (
      <EcraConfirmarEmail
        token={tokenConfirmacao}
        aoConfirmar={() => {
          esquecerToken('/confirmar-email');
          navegar('/');
          carregarEu();
        }}
      />
    );
  }
  if (estado.tipo === 'com-sessao') {
    if (caminho === '/projectos/novo') return <EcraNovoProjecto />;
    const orcamento = /^\/projectos\/([^/]+)\/orcamento$/.exec(caminho)?.[1];
    if (orcamento) return <EcraOrcamento key={orcamento} id={decodeURIComponent(orcamento)} />;
    const mesas = /^\/projectos\/([^/]+)\/mesas$/.exec(caminho)?.[1];
    if (mesas) return <EcraMesas key={mesas} id={decodeURIComponent(mesas)} />;
    const convidados = /^\/projectos\/([^/]+)\/convidados$/.exec(caminho)?.[1];
    if (convidados) return <EcraConvidados key={convidados} id={decodeURIComponent(convidados)} />;
    const projecto = /^\/projectos\/([^/]+)$/.exec(caminho)?.[1];
    if (projecto) return <EcraProjecto key={projecto} id={decodeURIComponent(projecto)} utilizadorId={estado.eu.id} />;
    if (caminho === '/equipa') return <EcraEquipa />;
    if (caminho === '/fornecedores') return <EcraFornecedores />;
    if (caminho === '/marca') return <EcraMarca />;
    if (caminho === '/admin' && estado.eu.administrador) return <EcraAdmin />;
    if (caminho === '/conta/palavra-passe') return <EcraMudarPalavraPasse />;
    if (caminho === '/conta/2fa') return <EcraDoisFactores eu={estado.eu} aoMudar={carregarEu} />;
    if (caminho === '/conta/dados') {
      return (
        <EcraDados
          eu={estado.eu}
          aoEliminar={() => {
            setAvisoEntrada(mensagens.ecras.dados.eliminada);
            setEstado({ tipo: 'anonimo' });
            navegar('/entrar');
          }}
        />
      );
    }
    return (
      <EcraInicio
        eu={estado.eu}
        aoSair={() => {
          // Num telemóvel partilhado, quem entrar a seguir não deve ser levado para o convite de outra pessoa.
          esquecerToken('/convite');
          setEstado({ tipo: 'anonimo' });
          // Quem acabou de sair volta à entrada, não à página pública.
          navegar('/entrar');
        }}
      />
    );
  }
  if (caminho === '/') return <EcraPublica />;
  if (caminho === '/registo') return <EcraRegisto aoEntrar={entrou} />;
  if (caminho === '/recuperar') return <EcraRecuperar />;
  return <EcraEntrar aoEntrar={entrou} aviso={avisoEntrada} />;
}
