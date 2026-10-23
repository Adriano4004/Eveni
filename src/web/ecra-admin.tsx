import { useEffect, useId, useState } from 'react';
import { type EspacoAdmin, PLANOS } from '../shared/esquemas.js';
import { formatarDataEHora } from '../shared/datas.js';
import { mensagens } from '../shared/mensagens.js';
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
