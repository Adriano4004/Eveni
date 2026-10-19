import { useEffect, useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { EcraConfirmarEmail, EcraEntrar, EcraInicio, EcraRegisto } from './ecras.js';
import { navegar, useCaminho } from './navegacao.js';

// O token da ligação de confirmação é lido uma vez, à entrada, e tirado do endereço para não ficar no
// histórico do browser. Fica guardado aqui enquanto a pessoa entra na conta, se ainda não tiver sessão.
const tokenConfirmacao = (() => {
  if (location.pathname !== '/confirmar-email') return '';
  const token = new URLSearchParams(location.search).get('token') ?? '';
  history.replaceState(null, '', '/confirmar-email');
  return token;
})();

type Estado = { tipo: 'a-carregar' } | { tipo: 'anonimo' } | { tipo: 'com-sessao'; eu: Eu };

export function App() {
  const caminho = useCaminho();
  const [estado, setEstado] = useState<Estado>({ tipo: 'a-carregar' });

  function carregarEu() {
    api<Eu>('GET', '/api/auth/eu')
      .then((eu) => setEstado({ tipo: 'com-sessao', eu }))
      // Sem sessão (401) ou sem ligação: mostrar o ecrã de entrada.
      .catch(() => setEstado({ tipo: 'anonimo' }));
  }

  useEffect(carregarEu, []);

  // Sem sessão só se pode estar em /entrar ou /registo; com sessão, não faz sentido lá estar.
  useEffect(() => {
    if (caminho === '/confirmar-email') return; // acessível com ou sem sessão
    if (estado.tipo === 'anonimo' && caminho !== '/registo') navegar('/entrar');
    if (estado.tipo === 'com-sessao' && (caminho === '/entrar' || caminho === '/registo')) navegar('/');
  }, [estado, caminho]);

  const entrou = (eu: Eu) => setEstado({ tipo: 'com-sessao', eu });

  if (estado.tipo === 'a-carregar') {
    return <p className="a-carregar">{mensagens.ecras.carregar}</p>;
  }
  if (caminho === '/confirmar-email') {
    // A confirmação exige sessão na conta que recebeu o e-mail (ver servidor): entrar primeiro.
    if (estado.tipo === 'anonimo') return <EcraEntrar aoEntrar={entrou} aviso={mensagens.ecras.confirmar.entrarPrimeiro} />;
    return (
      <EcraConfirmarEmail
        token={tokenConfirmacao}
        aoConfirmar={() => {
          navegar('/');
          carregarEu();
        }}
      />
    );
  }
  if (estado.tipo === 'com-sessao') {
    return <EcraInicio eu={estado.eu} aoSair={() => setEstado({ tipo: 'anonimo' })} />;
  }
  return caminho === '/registo' ? <EcraRegisto aoEntrar={entrou} /> : <EcraEntrar aoEntrar={entrou} />;
}
