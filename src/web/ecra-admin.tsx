import { useEffect, useId, useState } from 'react';
import { type EspacoAdmin, PLANOS } from '../shared/esquemas.js';
import { formatarData, formatarDataEHora, hojeEmLuanda } from '../shared/datas.js';
import { formatarKz } from '../shared/dinheiro.js';
import { mensagens } from '../shared/mensagens.js';
import type { PagamentoAdmin } from '../shared/pagamentos.js';
import { api, ErroApi, mensagemDeErro } from './api.js';
import { Logo } from './ecras.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.admin;

// Administração dos planos (decisão 027): só para os e-mails em ADMINS, com a verificação em dois passos.
export function EcraAdmin() {
  const [espacos, setEspacos] = useState<EspacoAdmin[]>();
  const [erro, setErro] = useState<string>();
  const [semDoisFactores, setSemDoisFactores] = useState(false);
  const idPesquisa = useId();

  async function carregar(pesquisa = '') {
    setErro(undefined);
    try {
      setEspacos(await api<EspacoAdmin[]>('GET', `/api/admin/espacos${pesquisa ? `?pesquisa=${encodeURIComponent(pesquisa)}` : ''}`));
    } catch (e) {
      if (e instanceof ErroApi && e.estado === 403) setSemDoisFactores(true);
      setErro(mensagemDeErro(e));
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const mudou = (actualizado: EspacoAdmin) => setEspacos((lista) => lista?.map((e) => (e.id === actualizado.id ? actualizado : e)));

  return (
    <main className="cartao cartao--largo">
      <Logo />
      <h1>{q.titulo}</h1>
      <p className="cartao__subtitulo">{q.subtitulo}</p>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {semDoisFactores ? (
        <button className="botao botao--primeiro" type="button" onClick={() => navegar('/conta/2fa')}>
          {q.activarDoisFactores}
        </button>
      ) : (
        <>
          <PagamentosPorConfirmar />
          <Formulario botao={q.pesquisar} aEnviar={q.aPesquisar} enviar={async (dados) => carregar(dados.pesquisa ?? '')}>
            {() => (
              <div className="campo">
                <label htmlFor={idPesquisa}>{q.pesquisa}</label>
                <input id={idPesquisa} name="pesquisa" type="search" autoComplete="off" maxLength={254} />
              </div>
            )}
          </Formulario>
          {espacos && (
            <>
              <p className="campo__ajuda">{espacos.length === 0 ? q.nenhum : q.mostrados(espacos.length)}</p>
              <ul className="convidados">
                {espacos.map((e) => (
                  <LinhaEspaco key={e.id} espaco={e} aoMudar={mudou} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <button className="botao botao--secundario" type="button" onClick={() => navegar('/')}>
        {q.voltar}
      </button>
    </main>
  );
}

function LinhaEspaco({ espaco: e, aoMudar }: { espaco: EspacoAdmin; aoMudar: (e: EspacoAdmin) => void }) {
  const [mudado, setMudado] = useState<string>();
  const idPlano = useId();
  return (
    <li className="convidado">
      <details>
        <summary>
          <span className="convidado__nome">{e.nome}</span>
          <span className="etiqueta">{mensagens.planos[e.plano]}</span>
          <span className="campo__ajuda convidado__detalhe">
            {[e.dono ? `${e.dono.nome} · ${e.dono.email}` : '—', q.projectos(e.projectos), q.membros(e.membros)].join(' · ')}
          </span>
        </summary>
        <div className="convidado__editar">
          <p className="campo__ajuda">
            {mensagens.planos[e.plano]} {q.desde(formatarDataEHora(new Date(e.planoDesde)))}
          </p>
          {e.acimaDoLimite && <p className="aviso aviso--alerta">{q.acimaDoLimite}</p>}
          <Formulario
            botao={q.guardar}
            aEnviar={q.aGuardar}
            enviar={async (dados) => {
              setMudado(undefined);
              const r = await api<Pick<EspacoAdmin, 'plano' | 'projectos' | 'membros' | 'acimaDoLimite'> & { mudou: boolean }>(
                'POST',
                `/api/admin/espacos/${e.id}/plano`,
                dados,
              );
              const { mudou, ...actual } = r;
              aoMudar({ ...e, ...actual, planoDesde: mudou ? new Date().toISOString() : e.planoDesde });
              setMudado(q.mudado(mensagens.planos[r.plano]));
            }}
          >
            {(erros) => (
              <div className="campo">
                <label htmlFor={idPlano}>{q.mudarPara}</label>
                <select id={idPlano} name="plano" defaultValue={e.plano} aria-invalid={erros.plano ? true : undefined}>
                  {PLANOS.map((p) => (
                    <option key={p} value={p}>
                      {mensagens.planos[p]}
                    </option>
                  ))}
                </select>
                {erros.plano && <p className="campo__erro">{erros.plano}</p>}
              </div>
            )}
          </Formulario>
          {mudado && (
            <p className="sucesso" role="status">
              {mudado}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

// Pagamentos por transferência com comprovativo enviado (decisão 029): ver o comprovativo, confirmar ou recusar.
function PagamentosPorConfirmar() {
  const [pagamentos, setPagamentos] = useState<PagamentoAdmin[]>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<PagamentoAdmin[]>('GET', '/api/admin/pagamentos').then(setPagamentos, (e) => setErro(mensagemDeErro(e)));
  }, []);

  return (
    <section>
      <h2>{q.pagamentosTitulo}</h2>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {pagamentos && pagamentos.length === 0 && <p className="campo__ajuda">{q.semPagamentos}</p>}
      {pagamentos && pagamentos.length > 0 && (
        <ul className="convidados">
          {pagamentos.map((p) => (
            <LinhaPagamento key={p.id} pagamento={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaPagamento({ pagamento: p }: { pagamento: PagamentoAdmin }) {
  const [resultado, setResultado] = useState<string>();
  const idMotivo = useId();
  const periodo = mensagens.pagamentos.periodos[p.periodo].toLowerCase();
  return (
    <li className="convidado">
      <details>
        <summary>
          <span className="convidado__nome">
            {p.referencia} · {p.espaco.nome}
          </span>
          <span className="etiqueta">{formatarKz(p.valorCentimos)}</span>
          <span className="campo__ajuda convidado__detalhe">
            {[`${mensagens.planos[p.plano]}, ${periodo}`, p.dono ? q.pedidoPor(p.dono.nome, p.dono.email) : '—'].join(' · ')}
          </span>
        </summary>
        <div className="convidado__editar">
          {resultado ? (
            <p className="sucesso" role="status">
              {resultado}
            </p>
          ) : (
            <>
              <a className="botao botao--secundario" href={`/api/admin/pagamentos/${p.id}/comprovativo`} download>
                {q.verComprovativo}
              </a>
              <Formulario
                botao={q.confirmar}
                aEnviar={q.aConfirmar}
                enviar={async () => {
                  const r = await api<{ fim: string }>('POST', `/api/admin/pagamentos/${p.id}/confirmar`);
                  setResultado(q.confirmado(formatarData(hojeEmLuanda(new Date(r.fim)))));
                }}
              >
                {() => null}
              </Formulario>
              <Formulario
                botao={q.recusar}
                aEnviar={q.aRecusar}
                perigo
                enviar={async (dados) => {
                  await api('POST', `/api/admin/pagamentos/${p.id}/recusar`, dados);
                  setResultado(q.recusado);
                }}
              >
                {(erros) => (
                  <div className="campo">
                    <label htmlFor={idMotivo}>{q.motivo}</label>
                    <input id={idMotivo} name="motivo" type="text" maxLength={500} autoComplete="off" aria-invalid={erros.motivo ? true : undefined} />
                    {erros.motivo && <p className="campo__erro">{erros.motivo}</p>}
                  </div>
                )}
              </Formulario>
            </>
          )}
        </div>
      </details>
    </li>
  );
}
