import { useEffect, useId, useState } from 'react';
import type { InfoRsvp } from '../shared/convidados.js';
import { formatarData } from '../shared/datas.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';
import { LigacoesLegais } from './ecras-legal.js';

const q = mensagens.ecras.rsvp;

// Página pública de RSVP (decisão 018): o convidado abre a ligação que recebeu (normalmente por WhatsApp)
// e responde "Vou" ou "Não vou", sem conta. Pode mudar a resposta até ao dia do evento.
// Pensada para telemóveis modestos e redes lentas: um só pedido para ver, um para responder.
export function EcraRsvp({ token }: { token: string }) {
  const [info, setInfo] = useState<InfoRsvp>();
  const [erro, setErro] = useState<string>();
  // A mudar a resposta (ou a responder pela primeira vez).
  const [aEditar, setAEditar] = useState(false);

  useEffect(() => {
    if (!token) {
      setErro(mensagens.rsvp.ligacaoInvalida);
      return;
    }
    api<InfoRsvp>('POST', '/api/rsvp/ver', { token })
      .then((i) => {
        setInfo(i);
        setAEditar(i.resposta === 'pending');
      })
      .catch((falha) => setErro(mensagemDeErro(falha)));
  }, [token]);

  if (!info) {
    return (
      <main className="cartao rsvp">
        <h1>{q.titulo}</h1>
        {erro ? (
          <p className="formulario__erro" role="alert">
            {erro}
          </p>
        ) : (
          <p className="a-carregar">{q.carregar}</p>
        )}
      </main>
    );
  }

  const data = formatarData(info.dataEvento);
  return (
    <main className="cartao rsvp">
      <p className="rsvp__ola">{q.ola(info.convidado)}</p>
      <p className="campo__ajuda">{q.convidado}</p>
      <h1>{info.evento}</h1>
      <dl className="detalhes">
        <div>
          <dt>{q.data}</dt>
          <dd>{data}</dd>
        </div>
        {info.local && (
          <div>
            <dt>{q.local}</dt>
            <dd>{info.local}</dd>
          </div>
        )}
      </dl>

      {!info.aberto ? (
        <>
          <Resposta info={info} />
          <p className="aviso">{q.fechado}</p>
        </>
      ) : aEditar ? (
        <FormularioResposta
          token={token}
          info={info}
          aoResponder={(nova) => {
            setInfo(nova);
            setAEditar(false);
          }}
        />
      ) : (
        <>
          <Resposta info={info} />
          <p className="campo__ajuda">{q.podeMudar(data)}</p>
          <button className="botao botao--secundario" type="button" onClick={() => setAEditar(true)}>
            {q.mudar}
          </button>
        </>
      )}
      <LigacoesLegais />
    </main>
  );
}

function Resposta({ info }: { info: InfoRsvp }) {
  if (info.resposta === 'pending') return <p className="campo__ajuda">{q.semResposta}</p>;
  return (
    <p className="sucesso" role="status">
      {info.resposta === 'yes' ? q.respostaVou(info.acompanhantesConfirmados) : q.respostaNaoVou}
    </p>
  );
}

function FormularioResposta({ token, info, aoResponder }: { token: string; info: InfoRsvp; aoResponder: (i: InfoRsvp) => void }) {
  const idAcompanhantes = useId();
  const [resposta, setResposta] = useState<'yes' | 'no' | undefined>(info.resposta === 'pending' ? undefined : info.resposta);
  const [acompanhantes, setAcompanhantes] = useState(info.acompanhantesConfirmados);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar() {
    if (!resposta) {
      setErro(q.escolha);
      return;
    }
    setAEnviar(true);
    setErro(undefined);
    try {
      aoResponder(await api<InfoRsvp>('POST', '/api/rsvp/responder', { token, resposta, acompanhantes: resposta === 'yes' ? acompanhantes : 0 }));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="rsvp__formulario">
      <fieldset className="rsvp__escolhas">
        <legend>{q.pergunta}</legend>
        {(
          [
            ['yes', q.vou],
            ['no', q.naoVou],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            className={`rsvp__opcao rsvp__opcao--${valor}`}
            aria-pressed={resposta === valor}
            onClick={() => {
              setResposta(valor);
              setErro(undefined);
            }}
          >
            {texto}
          </button>
        ))}
      </fieldset>
      {resposta === 'yes' && info.acompanhantes > 0 && (
        <div className="campo">
          <label htmlFor={idAcompanhantes}>{q.quantosAcompanhantes(info.acompanhantes)}</label>
          <select id={idAcompanhantes} value={acompanhantes} onChange={(ev) => setAcompanhantes(Number(ev.target.value))}>
            {Array.from({ length: info.acompanhantes + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <button className="botao" type="button" disabled={aEnviar} onClick={enviar}>
        {aEnviar ? q.aEnviar : q.confirmar}
      </button>
    </div>
  );
}
