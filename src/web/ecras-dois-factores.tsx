import { useState } from 'react';
import type { Eu, InicioDoisFactores } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Ligacao, Logo } from './ecras.js';
import { Formulario } from './Formulario.js';

const d = mensagens.ecras.doisFactores;

// "ABCDEFGH..." -> "ABCD EFGH ..." (mais fácil de copiar à mão para a aplicação)
const agrupar = (chave: string) => chave.match(/.{1,4}/g)?.join(' ') ?? chave;

export function EcraDoisFactores({ eu, aoMudar }: { eu: Eu; aoMudar: () => void }) {
  const [codigos, setCodigos] = useState<string[]>();
  const [desactivada, setDesactivada] = useState(false);

  return (
    <main className="cartao">
      <Logo />
      <h1>{codigos ? d.codigosTitulo : d.titulo}</h1>
      {codigos ? (
        <CodigosRecuperacao codigos={codigos} aoContinuar={() => setCodigos(undefined)} />
      ) : desactivada ? (
        <p className="sucesso" role="status">
          {d.desactivada}
        </p>
      ) : eu.doisFactores ? (
        <Gerir
          aoNovosCodigos={setCodigos}
          aoDesactivar={() => {
            setDesactivada(true);
            aoMudar();
          }}
        />
      ) : (
        <Activar
          aoActivar={(novos) => {
            setCodigos(novos);
            aoMudar();
          }}
        />
      )}
      <p className="cartao__rodape">
        <Ligacao para="/">{d.voltar}</Ligacao>
      </p>
    </main>
  );
}

function Activar({ aoActivar }: { aoActivar: (codigos: string[]) => void }) {
  const [inicio, setInicio] = useState<InicioDoisFactores>();
  const [aGerar, setAGerar] = useState(false);
  const [erro, setErro] = useState<string>();

  async function comecar() {
    setAGerar(true);
    setErro(undefined);
    try {
      setInicio(await api<InicioDoisFactores>('POST', '/api/conta/2fa/iniciar'));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAGerar(false);
    }
  }

  if (!inicio) {
    return (
      <>
        <p className="cartao__subtitulo">{d.explicacao}</p>
        {erro && (
          <p className="formulario__erro" role="alert">
            {erro}
          </p>
        )}
        <button className="botao" type="button" onClick={comecar} disabled={aGerar}>
          {aGerar ? d.aGerar : d.comecar}
        </button>
      </>
    );
  }

  return (
    <>
      <p>{d.passo1}</p>
      <img className="qr" src={inicio.qr} alt="" width={200} height={200} />
      <p className="cartao__subtitulo">{d.semCamara}</p>
      <code className="chave">{agrupar(inicio.segredo)}</code>
      <p>{d.passo2}</p>
      <Formulario
        botao={d.activar}
        aEnviar={d.aActivar}
        enviar={async (dados) => aoActivar((await api<{ codigosRecuperacao: string[] }>('POST', '/api/conta/2fa/activar', dados)).codigosRecuperacao)}
      >
        {(erros) => (
          <>
            <Campo rotulo={d.codigo} nome="codigo" autoComplete="one-time-code" numerico erro={erros.codigo} />
            <Campo rotulo={d.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
          </>
        )}
      </Formulario>
    </>
  );
}

function Gerir({ aoNovosCodigos, aoDesactivar }: { aoNovosCodigos: (codigos: string[]) => void; aoDesactivar: () => void }) {
  const campos = (erros: Record<string, string>) => (
    <>
      <Campo rotulo={d.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
      <Campo rotulo={d.codigoOuRecuperacao} nome="codigo" autoComplete="one-time-code" erro={erros.codigo} />
    </>
  );
  return (
    <>
      <p className="sucesso">{d.estaActiva}</p>
      <section className="seccao">
        <h2>{d.novosCodigos}</h2>
        <p className="cartao__subtitulo">{d.desactivarExplicacao}</p>
        <Formulario
          botao={d.novosCodigos}
          aEnviar={d.aGerar}
          enviar={async (dados) =>
            aoNovosCodigos((await api<{ codigosRecuperacao: string[] }>('POST', '/api/conta/2fa/codigos-recuperacao', dados)).codigosRecuperacao)
          }
        >
          {campos}
        </Formulario>
      </section>
      <section className="seccao">
        <h2>{d.desactivarTitulo}</h2>
        <Formulario
          botao={d.desactivar}
          aEnviar={d.aDesactivar}
          enviar={async (dados) => {
            await api('POST', '/api/conta/2fa/desactivar', dados);
            aoDesactivar();
          }}
        >
          {campos}
        </Formulario>
      </section>
    </>
  );
}

function CodigosRecuperacao({ codigos, aoContinuar }: { codigos: string[]; aoContinuar: () => void }) {
  const [copiados, setCopiados] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      setCopiados(true);
    } catch {
      // Sem acesso à área de transferência: a pessoa copia à mão.
    }
  }
  return (
    <>
      <p className="cartao__subtitulo">{d.codigosExplicacao}</p>
      <ul className="codigos" aria-label={d.codigosTitulo}>
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <button className="botao botao--secundario botao--primeiro" type="button" onClick={copiar}>
        {copiados ? d.copiados : d.copiar}
      </button>
      <button className="botao" type="button" onClick={aoContinuar}>
        {d.guardei}
      </button>
    </>
  );
}
