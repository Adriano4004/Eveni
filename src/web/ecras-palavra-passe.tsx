import { useState } from 'react';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { Campo } from './Campo.js';
import { Ligacao, Logo } from './ecras.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;

export function EcraRecuperar() {
  const r = e.recuperar;
  const [enviado, setEnviado] = useState<string>();
  return (
    <main className="cartao">
      <Logo />
      <h1>{r.titulo}</h1>
      {enviado ? (
        <p className="sucesso" role="status">
          {enviado}
        </p>
      ) : (
        <>
          <p className="cartao__subtitulo">{r.subtitulo}</p>
          <Formulario
            botao={r.botao}
            aEnviar={r.aEnviar}
            enviar={async (dados) => setEnviado((await api<{ mensagem: string }>('POST', '/api/auth/recuperar', dados)).mensagem)}
          >
            {(erros) => <Campo rotulo={r.email} nome="email" tipo="email" autoComplete="email" erro={erros.email} />}
          </Formulario>
        </>
      )}
      <p className="cartao__rodape">
        <Ligacao para="/entrar">{r.voltar}</Ligacao>
      </p>
    </main>
  );
}

// aoAlterar: todas as sessões terminaram no servidor (incluindo a deste browser, se existia).
export function EcraRedefinir({ token, aoAlterar }: { token: string; aoAlterar: () => void }) {
  const r = e.redefinir;
  const [alterada, setAlterada] = useState(false);
  if (!token) {
    return (
      <main className="cartao">
        <Logo />
        <h1>{r.titulo}</h1>
        <p className="cartao__subtitulo" role="alert">
          {mensagens.contas.ligacaoRecuperacaoInvalida}
        </p>
        <button className="botao" type="button" onClick={() => navegar('/recuperar')}>
          {r.pedirNova}
        </button>
      </main>
    );
  }
  if (alterada) {
    return (
      <main className="cartao">
        <Logo />
        <h1>{r.sucessoTitulo}</h1>
        <p className="cartao__subtitulo">{r.sucesso}</p>
        <button className="botao" type="button" onClick={() => navegar('/entrar')}>
          {r.entrar}
        </button>
      </main>
    );
  }
  return (
    <main className="cartao">
      <Logo />
      <h1>{r.titulo}</h1>
      <p className="cartao__subtitulo">{r.subtitulo}</p>
      <Formulario
        botao={r.botao}
        aEnviar={r.aEnviar}
        enviar={async (dados) => {
          await api('POST', '/api/auth/redefinir', { token, palavraPasse: dados.palavraPasse });
          setAlterada(true);
          aoAlterar();
        }}
      >
        {(erros) => (
          <Campo
            rotulo={r.palavraPasse}
            nome="palavraPasse"
            tipo="password"
            autoComplete="new-password"
            erro={erros.palavraPasse}
            ajuda={e.registo.ajudaPalavraPasse}
          />
        )}
      </Formulario>
      <p className="cartao__rodape">
        <Ligacao para="/recuperar">{r.pedirNova}</Ligacao>
      </p>
    </main>
  );
}

export function EcraMudarPalavraPasse() {
  const p = e.mudarPalavraPasse;
  const [mudada, setMudada] = useState(false);
  return (
    <main className="cartao">
      <Logo />
      <h1>{p.titulo}</h1>
      {mudada ? (
        <p className="sucesso" role="status">
          {p.sucesso}
        </p>
      ) : (
        <>
          <p className="cartao__subtitulo">{p.subtitulo}</p>
          <Formulario
            botao={p.botao}
            aEnviar={p.aEnviar}
            enviar={async (dados) => {
              await api('POST', '/api/conta/palavra-passe', dados);
              setMudada(true);
            }}
          >
            {(erros) => (
              <>
                <Campo
                  rotulo={p.actual}
                  nome="palavraPasseActual"
                  tipo="password"
                  autoComplete="current-password"
                  erro={erros.palavraPasseActual}
                />
                <Campo
                  rotulo={p.nova}
                  nome="palavraPasse"
                  tipo="password"
                  autoComplete="new-password"
                  erro={erros.palavraPasse}
                  ajuda={e.registo.ajudaPalavraPasse}
                />
              </>
            )}
          </Formulario>
        </>
      )}
      <p className="cartao__rodape">
        <Ligacao para="/">{p.voltar}</Ligacao>
      </p>
    </main>
  );
}
