import { useEffect, useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { EcraDados } from './ecras-dados.js';
import { EcraDoisFactores } from './ecras-dois-factores.js';
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

// Ecrãs só para quem não tem sessão, e ecrãs acessíveis com ou sem sessão.
const SO_ANONIMO = new Set(['/entrar', '/registo', '/recuperar']);
const QUALQUER = new Set(['/confirmar-email', '/redefinir-palavra-passe']);

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
    if (estado.tipo === 'anonimo' && !SO_ANONIMO.has(caminho)) navegar('/entrar');
    if (estado.tipo === 'com-sessao' && SO_ANONIMO.has(caminho)) navegar('/');
  }, [estado, caminho]);

  const entrou = (eu: Eu) => {
    // O aviso (ex.: "conta eliminada") só se mostra uma vez.
    setAvisoEntrada(undefined);
    setEstado({ tipo: 'com-sessao', eu });
  };

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
    const projecto = /^\/projectos\/([^/]+)$/.exec(caminho)?.[1];
    if (projecto) return <EcraProjecto key={projecto} id={decodeURIComponent(projecto)} utilizadorId={estado.eu.id} />;
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
    return <EcraInicio eu={estado.eu} aoSair={() => setEstado({ tipo: 'anonimo' })} />;
  }
  if (caminho === '/registo') return <EcraRegisto aoEntrar={entrou} />;
  if (caminho === '/recuperar') return <EcraRecuperar />;
  return <EcraEntrar aoEntrar={entrou} aviso={avisoEntrada} />;
}
