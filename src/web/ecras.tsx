import { useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { Campo } from './Campo.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;

function Logo() {
  return <img className="logo" src="/eveni-logo.png" alt={`${mensagens.app.nome} — ${mensagens.app.slogan}`} width={320} height={123} />;
}

function Ligacao({ para, children }: { para: string; children: string }) {
  return (
    <a
      href={para}
      onClick={(evento) => {
        evento.preventDefault();
        navegar(para);
      }}
    >
      {children}
    </a>
  );
}

export function EcraEntrar({ aoEntrar }: { aoEntrar: (eu: Eu) => void }) {
  return (
    <main className="cartao">
      <Logo />
      <h1>{e.entrar.titulo}</h1>
      <Formulario
        botao={e.entrar.botao}
        aEnviar={e.entrar.aEnviar}
        enviar={async (dados) => aoEntrar(await api<Eu>('POST', '/api/auth/entrar', dados))}
      >
        {(erros) => (
          <>
            <Campo rotulo={e.entrar.email} nome="email" tipo="email" autoComplete="email" erro={erros.email} />
            <Campo rotulo={e.entrar.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
          </>
        )}
      </Formulario>
      <p className="cartao__rodape">
        {e.entrar.semConta} <Ligacao para="/registo">{e.entrar.ligacaoRegisto}</Ligacao>
      </p>
    </main>
  );
}

export function EcraRegisto({ aoEntrar }: { aoEntrar: (eu: Eu) => void }) {
  return (
    <main className="cartao">
      <Logo />
      <h1>{e.registo.titulo}</h1>
      <p className="cartao__subtitulo">{e.registo.subtitulo}</p>
      <Formulario
        botao={e.registo.botao}
        aEnviar={e.registo.aEnviar}
        enviar={async (dados) => aoEntrar(await api<Eu>('POST', '/api/auth/registo', dados))}
      >
        {(erros) => (
          <>
            <Campo rotulo={e.registo.nome} nome="nome" autoComplete="name" erro={erros.nome} />
            <Campo rotulo={e.registo.email} nome="email" tipo="email" autoComplete="email" erro={erros.email} />
            <Campo
              rotulo={e.registo.palavraPasse}
              nome="palavraPasse"
              tipo="password"
              autoComplete="new-password"
              erro={erros.palavraPasse}
              ajuda={e.registo.ajudaPalavraPasse}
            />
          </>
        )}
      </Formulario>
      <p className="cartao__rodape">
        {e.registo.jaTemConta} <Ligacao para="/entrar">{e.registo.ligacaoEntrar}</Ligacao>
      </p>
    </main>
  );
}

export function EcraInicio({ eu, aoSair }: { eu: Eu; aoSair: () => void }) {
  const [aSair, setASair] = useState(false);
  const [erro, setErro] = useState<string>();

  async function sair(todos: boolean) {
    if (todos && !confirm(e.inicio.confirmarSairDeTodos)) return;
    setASair(true);
    setErro(undefined);
    try {
      await api('POST', todos ? '/api/auth/sair-de-todos' : '/api/auth/sair');
      aoSair();
    } catch {
      // Nunca mostrar o ecrã de entrada se o servidor não confirmou: a pessoa julgaria que as
      // sessões terminaram (ex.: depois de perder o telemóvel) quando continuam válidas.
      setErro(e.inicio.erroSair);
      setASair(false);
    }
  }

  return (
    <main className="cartao">
      <Logo />
      <h1>{e.inicio.ola(eu.nome)}</h1>
      <p className="cartao__subtitulo">{e.inicio.emConstrucao}</p>
      <dl className="detalhes">
        <div>
          <dt>{e.inicio.espaco}</dt>
          <dd>{eu.espaco.nome}</dd>
        </div>
        <div>
          <dt>{e.inicio.plano}</dt>
          <dd>{mensagens.planos[eu.espaco.plano]}</dd>
        </div>
      </dl>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <button className="botao" type="button" onClick={() => sair(false)} disabled={aSair}>
        {aSair ? e.inicio.aSair : e.inicio.sair}
      </button>
      <button className="botao botao--secundario" type="button" onClick={() => sair(true)} disabled={aSair}>
        {e.inicio.sairDeTodos}
      </button>
    </main>
  );
}
