import { useEffect, useState } from 'react';
import { formatarData, hojeEmLuanda } from '../shared/datas.js';
import type { ConviteCriado, Equipa, InfoConvite } from '../shared/equipa.js';
import { mensagens } from '../shared/mensagens.js';
import { api, ErroApi, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;

// Data de um instante (ISO) no calendário de Luanda, em dd/mm/aaaa.
const dataDe = (instante: string) => formatarData(hojeEmLuanda(new Date(instante)));

// Equipa do espaço de que a pessoa é dona: membros, convites por aceitar e criar convites.
export function EcraEquipa() {
  const q = e.equipa;
  const [equipa, setEquipa] = useState<Equipa>();
  const [erro, setErro] = useState<string>();
  const [criado, setCriado] = useState<ConviteCriado>();

  const carregar = () =>
    api<Equipa>('GET', '/api/equipa')
      .then(setEquipa)
      .catch((falha) => setErro(mensagemDeErro(falha)));

  useEffect(() => {
    carregar();
  }, []);

  async function accao(caminho: string, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setErro(undefined);
    try {
      await api('POST', caminho);
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar('/')}>
      {q.voltar}
    </button>
  );

  if (!equipa) {
    return (
      <main className="cartao">
        {voltar}
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

  const semColaboracao = equipa.limite === 1;
  const completa = equipa.limite !== null && equipa.ocupados >= equipa.limite;

  return (
    <main className="cartao">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="cartao__subtitulo">{equipa.espaco}</p>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}

      {semColaboracao ? (
        <p className="aviso">{mensagens.equipa.semColaboracao}</p>
      ) : (
        <p className="campo__ajuda">{q.ocupacao(equipa.ocupados, equipa.limite)}</p>
      )}

      <section className="seccao seccao--primeira" aria-labelledby="titulo-membros">
        <h2 id="titulo-membros">{q.membros}</h2>
        <ul className="lista-equipa">
          {equipa.membros.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.nome}</strong>
                <span className="campo__ajuda">{m.email}</span>
              </span>
              {m.papel === 'owner' ? (
                <span className="etiqueta">{q.dono}</span>
              ) : (
                <button
                  className="botao botao--secundario botao--compacto"
                  type="button"
                  onClick={() => accao(`/api/equipa/membros/${m.id}/remover`, q.confirmarRetirar(m.nome))}
                >
                  {q.retirar}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {equipa.convites.length > 0 && (
        <section className="seccao" aria-labelledby="titulo-convites">
          <h2 id="titulo-convites">{q.convitesPendentes}</h2>
          <ul className="lista-equipa">
            {equipa.convites.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.email}</strong>
                  <span className="campo__ajuda">{q.expira(dataDe(c.expiraEm))}</span>
                </span>
                <button className="botao botao--secundario botao--compacto" type="button" onClick={() => accao(`/api/equipa/convites/${c.id}/revogar`)}>
                  {q.cancelarConvite}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!semColaboracao && (
        <section className="seccao" aria-labelledby="titulo-convidar">
          <h2 id="titulo-convidar">{q.convidar}</h2>
          {criado && <ConviteParaPartilhar convite={criado} espaco={equipa.espaco} />}
          {completa ? (
            <p className="campo__ajuda">{q.limiteAtingido}</p>
          ) : (
            <Formulario
              botao={q.criarConvite}
              aEnviar={q.aCriar}
              limparAoEnviar
              enviar={async (dados) => {
                const convite = await api<ConviteCriado>('POST', '/api/equipa/convites', { email: dados.email });
                setCriado(convite);
                await carregar();
              }}
            >
              {(erros) => <Campo rotulo={q.emailConvidado} nome="email" tipo="email" autoComplete="off" erro={erros.email} ajuda={q.ajudaConvite} />}
            </Formulario>
          )}
        </section>
      )}
    </main>
  );
}

// A ligação só aparece uma vez: copiar ou partilhar por WhatsApp.
function ConviteParaPartilhar({ convite, espaco }: { convite: ConviteCriado; espaco: string }) {
  const q = e.equipa;
  const [copiada, setCopiada] = useState(false);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(q.mensagemWhatsapp(espaco, convite.ligacao))}`;
  return (
    <div className="sucesso convite-criado" role="status">
      <strong>{q.criado}</strong>
      <p>{q.criadoTexto}</p>
      <p className="ligacao-convite">{convite.ligacao}</p>
      <a className="botao" href={whatsapp} target="_blank" rel="noopener noreferrer">
        {q.whatsapp}
      </a>
      <button
        className="botao botao--secundario"
        type="button"
        onClick={() =>
          navigator.clipboard
            ?.writeText(convite.ligacao)
            .then(() => setCopiada(true))
            .catch(() => setCopiada(false))
        }
      >
        {copiada ? q.copiada : q.copiar}
      </button>
    </div>
  );
}

// Quem abre a ligação do convite: vê de quem é; com sessão, aceita; sem sessão, entra ou cria conta primeiro.
// `aoTerminar` esquece a ligação guardada no separador: depois de aceitar, ou quando ela já não serve
// (inválida, usada, cancelada, expirada, equipa completa). Um 403 (e-mail por confirmar, ou sessão noutra
// conta) resolve-se sem sair do ecrã, por isso aí a ligação mantém-se.
export function EcraConvite({ token, comSessao, aoTerminar }: { token: string; comSessao: boolean; aoTerminar: () => void }) {
  const c = e.convite;
  const [info, setInfo] = useState<InfoConvite>();
  const [erro, setErro] = useState<string>();
  const [aceite, setAceite] = useState<string>();
  const [aAceitar, setAAceitar] = useState(false);

  useEffect(() => {
    if (!token) {
      setErro(mensagens.equipa.conviteInvalido);
      return;
    }
    api<InfoConvite>('POST', '/api/convites/ver', { token })
      .then(setInfo)
      .catch(falhou);
  }, [token]);

  function falhou(falha: unknown) {
    setErro(mensagemDeErro(falha));
    if (falha instanceof ErroApi && (falha.estado === 404 || falha.estado === 409)) {
      setInfo(undefined);
      aoTerminar();
    }
  }

  async function aceitar() {
    setAAceitar(true);
    setErro(undefined);
    try {
      const r = await api<{ espaco: string }>('POST', '/api/convites/aceitar', { token });
      setAceite(r.espaco);
      aoTerminar();
    } catch (falha) {
      falhou(falha);
    } finally {
      setAAceitar(false);
    }
  }

  return (
    <main className="cartao">
      <h1>{c.titulo}</h1>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {!info && !erro && <p className="a-carregar">{c.carregar}</p>}
      {erro && !info && !aceite && (
        <button className="botao botao--secundario" type="button" onClick={() => navegar('/')}>
          {c.irInicio}
        </button>
      )}
      {aceite ? (
        <>
          <p className="sucesso">{c.aceite(aceite)}</p>
          <button className="botao" type="button" onClick={() => navegar('/')}>
            {c.irInicio}
          </button>
        </>
      ) : (
        info && (
          <>
            <p className="cartao__subtitulo">{c.texto(info.convidadoPor, info.espaco)}</p>
            <p>{c.paraEmail(info.email)}</p>
            {comSessao ? (
              <button className="botao" type="button" disabled={aAceitar} onClick={aceitar}>
                {aAceitar ? c.aAceitar : c.aceitar}
              </button>
            ) : (
              <>
                <p className="campo__ajuda">{c.entrarParaAceitar}</p>
                <button className="botao" type="button" onClick={() => navegar('/entrar')}>
                  {c.entrar}
                </button>
                <button className="botao botao--secundario" type="button" onClick={() => navegar('/registo')}>
                  {c.criarConta}
                </button>
              </>
            )}
          </>
        )
      )}
    </main>
  );
}
