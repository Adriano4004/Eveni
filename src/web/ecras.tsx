import { useEffect, useRef, useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api, ErroApi, mensagemDeErro } from './api.js';
import { ListaProjectos } from './ecras-projectos.js';
import { Campo } from './Campo.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;

export function Logo() {
  return <img className="logo" src="/eveni-logo.png" alt={`${mensagens.app.nome} — ${mensagens.app.slogan}`} width={320} height={123} />;
}

export function Ligacao({ para, children }: { para: string; children: string }) {
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

export function EcraEntrar({ aoEntrar, aviso }: { aoEntrar: (eu: Eu) => void; aviso?: string }) {
  // Com a verificação em dois passos activa, a palavra-passe certa leva ao pedido do código.
  const [pedirCodigo, setPedirCodigo] = useState(false);
  if (pedirCodigo) return <EcraCodigoEntrada aoEntrar={aoEntrar} aoCancelar={() => setPedirCodigo(false)} />;
  return (
    <main className="cartao">
      <Logo />
      <h1>{e.entrar.titulo}</h1>
      {aviso && <p className="cartao__subtitulo">{aviso}</p>}
      <Formulario
        botao={e.entrar.botao}
        aEnviar={e.entrar.aEnviar}
        enviar={async (dados) => {
          const resposta = await api<Eu | { doisFactores: true }>('POST', '/api/auth/entrar', dados);
          if ('id' in resposta) aoEntrar(resposta);
          else setPedirCodigo(true);
        }}
      >
        {(erros) => (
          <>
            <Campo rotulo={e.entrar.email} nome="email" tipo="email" autoComplete="email" erro={erros.email} />
            <Campo rotulo={e.entrar.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
          </>
        )}
      </Formulario>
      <p className="cartao__rodape">
        <Ligacao para="/recuperar">{e.entrar.esqueceu}</Ligacao>
      </p>
      <p className="cartao__rodape cartao__rodape--junto">
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
      {!eu.emailConfirmado && <AvisoConfirmar email={eu.email} />}
      <ListaProjectos eu={eu} />
      <dl className="detalhes">
        <div>
          <dt>{e.inicio.espaco}</dt>
          <dd>{eu.espaco.nome}</dd>
        </div>
        <div>
          <dt>{e.inicio.plano}</dt>
          <dd>{mensagens.planos[eu.espaco.plano]}</dd>
        </div>
        <div>
          <dt>{e.inicio.doisFactores}</dt>
          <dd>{eu.doisFactores ? e.inicio.doisFactoresActivo : e.inicio.doisFactoresInactivo}</dd>
        </div>
      </dl>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <button className="botao botao--secundario botao--primeiro" type="button" onClick={() => navegar('/conta/palavra-passe')}>
        {e.inicio.mudarPalavraPasse}
      </button>
      <button className="botao botao--secundario botao--primeiro" type="button" onClick={() => navegar('/conta/2fa')}>
        {e.inicio.gerirDoisFactores}
      </button>
      <button className="botao botao--secundario botao--primeiro" type="button" onClick={() => navegar('/conta/dados')}>
        {e.inicio.osMeusDados}
      </button>
      <button className="botao" type="button" onClick={() => sair(false)} disabled={aSair}>
        {aSair ? e.inicio.aSair : e.inicio.sair}
      </button>
      <button className="botao botao--secundario" type="button" onClick={() => sair(true)} disabled={aSair}>
        {e.inicio.sairDeTodos}
      </button>
    </main>
  );
}

function AvisoConfirmar({ email }: { email: string }) {
  const a = e.avisoConfirmar;
  const [estado, setEstado] = useState<'parado' | 'a-enviar' | 'enviado'>('parado');
  const [erro, setErro] = useState<string>();

  async function reenviar() {
    setEstado('a-enviar');
    setErro(undefined);
    try {
      await api('POST', '/api/auth/reenviar-confirmacao');
      setEstado('enviado');
    } catch (falha) {
      setErro(mensagemDeErro(falha));
      setEstado('parado');
    }
  }

  return (
    <section className="aviso" aria-labelledby="aviso-confirmar-titulo">
      <h2 id="aviso-confirmar-titulo">{a.titulo}</h2>
      <p>{a.texto(email)}</p>
      {estado === 'enviado' ? (
        <p role="status">{a.reenviado}</p>
      ) : (
        <button className="botao botao--secundario botao--compacto" type="button" onClick={reenviar} disabled={estado === 'a-enviar'}>
          {estado === 'a-enviar' ? a.aReenviar : a.reenviar}
        </button>
      )}
      {erro && (
        <p className="aviso__erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}

export function EcraConfirmarEmail({ token, aoConfirmar }: { token: string; aoConfirmar: () => void }) {
  const c = e.confirmar;
  type Estado = { tipo: 'a-confirmar' } | { tipo: 'confirmado' } | { tipo: 'erro'; mensagem: string; podeRepetir: boolean };
  const [estado, setEstado] = useState<Estado>({ tipo: 'a-confirmar' });
  const iniciado = useRef(false);

  function confirmar() {
    setEstado({ tipo: 'a-confirmar' });
    api('POST', '/api/auth/confirmar-email', { token })
      .then(() => setEstado({ tipo: 'confirmado' }))
      .catch((falha) =>
        // Sem ligação (estado 0) a ligação não chegou a ser usada: pode tentar-se de novo.
        setEstado({ tipo: 'erro', mensagem: mensagemDeErro(falha), podeRepetir: falha instanceof ErroApi && falha.estado === 0 }),
      );
  }

  useEffect(() => {
    // Em modo de desenvolvimento o React corre os efeitos duas vezes: a ligação só pode ser gasta uma.
    if (iniciado.current) return;
    iniciado.current = true;
    confirmar();
  }, []);

  return (
    <main className="cartao">
      <Logo />
      {estado.tipo === 'a-confirmar' && <p role="status">{c.aConfirmar}</p>}
      {estado.tipo === 'confirmado' && (
        <>
          <h1>{c.sucessoTitulo}</h1>
          <p className="cartao__subtitulo">{c.sucesso}</p>
          <button className="botao" type="button" onClick={aoConfirmar}>
            {c.continuar}
          </button>
        </>
      )}
      {estado.tipo === 'erro' && (
        <>
          <h1>{c.erroTitulo}</h1>
          <p className="cartao__subtitulo" role="alert">
            {estado.mensagem}
          </p>
          {estado.podeRepetir ? (
            <button className="botao" type="button" onClick={confirmar}>
              {c.tentarDeNovo}
            </button>
          ) : (
            <button className="botao" type="button" onClick={aoConfirmar}>
              {c.continuar}
            </button>
          )}
        </>
      )}
    </main>
  );
}

function EcraCodigoEntrada({ aoEntrar, aoCancelar }: { aoEntrar: (eu: Eu) => void; aoCancelar: () => void }) {
  const c = e.entrarCodigo;
  const [recuperacao, setRecuperacao] = useState(false);
  return (
    <main className="cartao">
      <Logo />
      <h1>{c.titulo}</h1>
      <p className="cartao__subtitulo">{recuperacao ? c.subtituloRecuperacao : c.subtitulo}</p>
      <Formulario
        // Trocar de modo recria o formulário (campos e erros limpos).
        key={recuperacao ? 'recuperacao' : 'aplicacao'}
        botao={c.botao}
        aEnviar={c.aEnviar}
        enviar={async (dados) => aoEntrar(await api<Eu>('POST', '/api/auth/entrar/2fa', dados))}
      >
        {(erros) =>
          recuperacao ? (
            <Campo rotulo={c.codigoRecuperacao} nome="codigoRecuperacao" autoComplete="off" erro={erros.codigoRecuperacao} />
          ) : (
            <Campo rotulo={c.codigo} nome="codigo" autoComplete="one-time-code" numerico erro={erros.codigo} />
          )
        }
      </Formulario>
      <p className="cartao__rodape">
        <button className="ligacao" type="button" onClick={() => setRecuperacao(!recuperacao)}>
          {recuperacao ? c.usarAplicacao : c.usarRecuperacao}
        </button>
      </p>
      <p className="cartao__rodape cartao__rodape--junto">
        <button className="ligacao" type="button" onClick={aoCancelar}>
          {c.cancelar}
        </button>
      </p>
    </main>
  );
}
