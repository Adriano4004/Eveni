import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useId, useState } from 'react';
import { formatarData } from '../shared/datas.js';
import { formatarKz } from '../shared/dinheiro.js';
import { mensagens } from '../shared/mensagens.js';
import { ESTADOS_TAREFA, type EstadoTarefa, type Pessoa, type Projecto, type ResumoProjecto, type TarefaProjecto } from '../shared/projectos.js';
import {
  type Filtros,
  filtrarTarefas,
  filtrosActivos,
  intervaloDeMeses,
  mesDe,
  RESPONSAVEL_EU,
  RESPONSAVEL_NINGUEM,
  semanasDoMes,
  somarMeses,
  tarefasNoDia,
  valoresDistintos,
} from '../shared/vistas.js';
import { api, mensagemDeErro } from './api.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;
const p = e.projecto;

type Alteracao = { estado?: EstadoTarefa; responsavelId?: string | null };

export function EcraProjecto({ id, utilizadorId }: { id: string; utilizadorId: string }) {
  const [projecto, setProjecto] = useState<Projecto>();
  const [erro, setErro] = useState<string>();
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista');
  const [filtros, setFiltros] = useState<Filtros>({});

  useEffect(() => {
    api<Projecto>('GET', `/api/projectos/${encodeURIComponent(id)}`)
      .then(setProjecto)
      .catch((falha) => setErro(mensagemDeErro(falha)));
  }, [id]);

  // Guarda no servidor e substitui a tarefa pela versão devolvida (a que conta é a do servidor).
  async function alterar(tarefa: TarefaProjecto, alteracao: Alteracao) {
    const nova = await api<TarefaProjecto>('POST', `/api/projectos/${encodeURIComponent(id)}/tarefas/${tarefa.id}`, alteracao);
    setProjecto((actual) => {
      if (!actual) return actual;
      const tarefas = actual.tarefasDoProjecto.map((t) => (t.id === nova.id ? nova : t));
      return {
        ...actual,
        tarefasDoProjecto: tarefas,
        concluidas: tarefas.filter((t) => t.estado === 'done').length,
        criticasEmAtraso: tarefas.filter((t) => t.critica && t.emAtraso).length,
      };
    });
  }

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar('/')}>
      {p.voltar}
    </button>
  );

  if (erro) {
    return (
      <main className="cartao">
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
        {voltar}
      </main>
    );
  }
  if (!projecto) return <p className="a-carregar">{p.carregar}</p>;

  const arquivado = projecto.estado === 'archived';
  // Arquivado ou com acesso só de leitura: nada se altera.
  const soLeitura = arquivado || projecto.papel === 'viewer';
  // Um leitor não pode ser responsável: não conseguiria marcar a tarefa como feita.
  const responsaveis = projecto.membros.filter((m) => m.papel !== 'viewer');
  // Fases pela ordem do template.
  const fases = valoresDistintos(projecto.tarefasDoProjecto, 'fase');
  // Se a pessoa escolhida no filtro de responsável deixou de ter acesso, o filtro deixa de se aplicar
  // (o menu já não a mostra; continuar a filtrar daria uma lista vazia sem explicação).
  const filtrosValidos =
    filtros.responsavel && ![RESPONSAVEL_EU, RESPONSAVEL_NINGUEM].includes(filtros.responsavel) && !projecto.membros.some((m) => m.id === filtros.responsavel)
      ? { ...filtros, responsavel: undefined }
      : filtros;
  const visiveis = filtrarTarefas(projecto.tarefasDoProjecto, filtrosValidos, utilizadorId);

  return (
    <main className="cartao cartao--largo">
      {voltar}
      <h1>{projecto.nome}</h1>
      <dl className="detalhes">
        <div>
          <dt>{p.dataEvento}</dt>
          <dd>{formatarData(projecto.dataEvento)}</dd>
        </div>
        {projecto.local && (
          <div>
            <dt>{p.local}</dt>
            <dd>{projecto.local}</dd>
          </div>
        )}
        <div>
          <dt>{p.tipo}</dt>
          <dd>{projecto.nomeTemplate}</dd>
        </div>
      </dl>

      {arquivado && (
        <div className="aviso">
          <p>{p.arquivado}</p>
          {projecto.podeArquivar && <BotaoArquivo projecto={projecto} aoMudar={setProjecto} />}
        </div>
      )}
      {!arquivado && projecto.papel === 'viewer' && <p className="aviso">{p.leitor}</p>}
      {!arquivado && <AlertaAtrasos tarefas={projecto.tarefasDoProjecto} />}

      <section className="seccao" aria-labelledby="titulo-tarefas">
        <h2 id="titulo-tarefas">
          {p.tarefas} <span className="campo__ajuda">{e.projectos.progresso(projecto.concluidas, projecto.tarefas)}</span>
        </h2>
        <ProgressoCategorias tarefas={projecto.tarefasDoProjecto} />

        <div className="vistas" role="group" aria-label={p.vistas}>
          {(['lista', 'calendario'] as const).map((v) => (
            <button key={v} type="button" className="vistas__botao" aria-pressed={vista === v} onClick={() => setVista(v)}>
              {v === 'lista' ? p.vistaLista : p.vistaCalendario}
            </button>
          ))}
        </div>
        <PainelFiltros tarefas={projecto.tarefasDoProjecto} membros={projecto.membros} filtros={filtrosValidos} mudar={setFiltros} />
        {filtrosActivos(filtrosValidos) > 0 && (
          <p className="campo__ajuda" aria-live="polite">
            {p.aMostrar(visiveis.length, projecto.tarefas)}
          </p>
        )}
        {visiveis.length === 0 && <p className="campo__ajuda">{p.nenhumaTarefa}</p>}

        {vista === 'lista' &&
          fases.map((fase) => {
            const daFase = visiveis.filter((t) => t.fase === fase);
            if (daFase.length === 0) return null;
            return (
              <div key={fase} className="fase">
                <h3>{fase}</h3>
                <ul className="tarefas">
                  {daFase.map((t) => (
                    <Tarefa key={t.id} tarefa={t} membros={responsaveis} soLeitura={soLeitura} arquivado={arquivado} alterar={(a) => alterar(t, a)} />
                  ))}
                </ul>
              </div>
            );
          })}
        {vista === 'calendario' && (
          <Calendario
            tarefas={visiveis}
            todas={projecto.tarefasDoProjecto}
            dataEvento={projecto.dataEvento}
            hoje={projecto.hoje}
            desenharTarefa={(t) => (
              <Tarefa key={t.id} tarefa={t} membros={responsaveis} soLeitura={soLeitura} arquivado={arquivado} alterar={(a) => alterar(t, a)} />
            )}
          />
        )}
      </section>

      <section className="seccao" aria-labelledby="titulo-convidados">
        <h2 id="titulo-convidados">{p.convidados}</h2>
        <p className="campo__ajuda">{p.convidadosTexto(projecto.totalConvidados)}</p>
        <button className="botao botao--secundario" type="button" onClick={() => navegar(`/projectos/${encodeURIComponent(id)}/convidados`)}>
          {p.verConvidados}
        </button>
      </section>

      <section className="seccao" aria-labelledby="titulo-orcamento">
        <h2 id="titulo-orcamento">{p.orcamento}</h2>
        <p className="campo__ajuda">{p.emBreveOrcamento}</p>
        <ul className="orcamento">
          {projecto.orcamento.map((item) => (
            <li key={item.id}>
              <span>
                {item.descricao} <span className="campo__ajuda">{item.categoria}</span>
                {item.obrigatoria && <span className="etiqueta">{p.obrigatoria}</span>}
              </span>
              <span className="orcamento__valor">
                {p.previsto}: {formatarKz(item.previstoCentimos)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {projecto.podeArquivar && <AcessosProjecto projecto={projecto} aoMudar={setProjecto} />}

      {!arquivado && projecto.podeArquivar && (
        <section className="seccao" aria-labelledby="titulo-arquivar">
          <h2 id="titulo-arquivar">{p.arquivar}</h2>
          <p className="campo__ajuda">{p.arquivarTexto}</p>
          <BotaoArquivo projecto={projecto} aoMudar={setProjecto} />
        </section>
      )}
    </main>
  );
}

// Só para o dono do espaço: quem tem acesso ao projecto, mudar o papel, retirar e dar acesso a quem é
// da equipa. Depois de cada alteração, o projecto é lido de novo (os responsáveis podem ter mudado).
function AcessosProjecto({ projecto, aoMudar }: { projecto: Projecto; aoMudar: Dispatch<SetStateAction<Projecto | undefined>> }) {
  const id = useId();
  const [erro, setErro] = useState<string>();
  const [aEnviar, setAEnviar] = useState(false);
  const [pessoa, setPessoa] = useState('');
  const [papel, setPapel] = useState<'editor' | 'viewer'>('editor');
  const outros = projecto.membros.filter((m) => m.papel !== 'owner');
  const base = `/api/projectos/${encodeURIComponent(projecto.id)}/acessos`;

  async function alterar(caminho: string, corpo?: object, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setAEnviar(true);
    setErro(undefined);
    try {
      await api('POST', caminho, corpo);
      aoMudar(await api<Projecto>('GET', `/api/projectos/${encodeURIComponent(projecto.id)}`));
      setPessoa('');
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <section className="seccao" aria-labelledby="titulo-acessos">
      <h2 id="titulo-acessos">{p.acessos}</h2>
      <p className="campo__ajuda">{p.acessosTexto}</p>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="lista-equipa">
        {projecto.membros
          .filter((m) => m.papel === 'owner')
          .map((m) => (
            <li key={m.id}>
              <strong>{m.nome}</strong>
              <span className="etiqueta">{p.papeisAcesso.owner}</span>
            </li>
          ))}
        {outros.map((m) => (
          <li key={m.id}>
            <strong>{m.nome}</strong>
            <span className="acesso__accoes">
              <select
                aria-label={`${p.acesso}: ${m.nome}`}
                value={m.papel}
                disabled={aEnviar}
                onChange={(evento) =>
                  alterar(base, { utilizadorId: m.id, papel: evento.target.value }, evento.target.value === 'viewer' ? p.confirmarLeitor(m.nome) : undefined)
                }
              >
                <option value="editor">{p.papeisAcesso.editor}</option>
                <option value="viewer">{p.papeisAcesso.viewer}</option>
              </select>
              <button
                className="botao botao--secundario botao--compacto"
                type="button"
                disabled={aEnviar}
                onClick={() => alterar(`${base}/${m.id}/remover`, undefined, p.confirmarRetirarAcesso(m.nome))}
              >
                {p.retirarAcesso}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {projecto.semAcesso.length > 0 ? (
        <form
          className="formulario dar-acesso"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (pessoa) alterar(base, { utilizadorId: pessoa, papel });
          }}
        >
          <div className="campo">
            <label htmlFor={`${id}-pessoa`}>{p.pessoa}</label>
            <select id={`${id}-pessoa`} value={pessoa} required onChange={(evento) => setPessoa(evento.target.value)}>
              <option value="">—</option>
              {projecto.semAcesso.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor={`${id}-papel`}>{p.acesso}</label>
            <select id={`${id}-papel`} value={papel} onChange={(evento) => setPapel(evento.target.value as 'editor' | 'viewer')}>
              <option value="editor">{p.papeisAcesso.editor}</option>
              <option value="viewer">{p.papeisAcesso.viewer}</option>
            </select>
          </div>
          <button className="botao" type="submit" disabled={aEnviar || !pessoa}>
            {p.darAcesso}
          </button>
        </form>
      ) : outros.length > 0 ? (
        <p className="campo__ajuda">{p.todosComAcesso}</p>
      ) : (
        <>
          <p className="campo__ajuda">{p.semEquipa}</p>
          <button className="botao botao--secundario" type="button" onClick={() => navegar('/equipa')}>
            {p.irEquipa}
          </button>
        </>
      )}
    </section>
  );
}

// Arquivar (no fim da página) ou restaurar (no aviso de projecto arquivado). Só para o dono do espaço.
function BotaoArquivo({ projecto, aoMudar }: { projecto: Projecto; aoMudar: Dispatch<SetStateAction<Projecto | undefined>> }) {
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string>();
  const arquivar = projecto.estado === 'active';

  async function mudar() {
    if (arquivar && !confirm(p.confirmarArquivar)) return;
    setAEnviar(true);
    setErro(undefined);
    try {
      const resumo = await api<ResumoProjecto>('POST', `/api/projectos/${encodeURIComponent(projecto.id)}/${arquivar ? 'arquivar' : 'restaurar'}`);
      // Sobre o estado actual, não sobre a cópia do momento do clique: uma tarefa guardada entretanto não se perde.
      aoMudar((actual) => actual && { ...actual, ...resumo });
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <button className="botao botao--secundario" type="button" disabled={aEnviar} onClick={mudar}>
        {arquivar ? (aEnviar ? p.aArquivar : p.arquivar) : aEnviar ? p.aRestaurar : p.restaurar}
      </button>
    </>
  );
}

// Críticas em atraso no topo do projecto, para não passarem despercebidas.
function AlertaAtrasos({ tarefas }: { tarefas: TarefaProjecto[] }) {
  const atrasadas = tarefas.filter((t) => t.critica && t.emAtraso);
  if (atrasadas.length === 0) return null;
  return (
    <div className="aviso aviso--alerta" role="status">
      <h2>{p.alertaAtrasos(atrasadas.length)}</h2>
      <p>{p.alertaTexto}</p>
      <ul className="avisos">
        {atrasadas.map((t) => (
          <li key={t.id}>
            <strong>{t.titulo}</strong> — {p.prazo(formatarData(t.fim))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressoCategorias({ tarefas }: { tarefas: TarefaProjecto[] }) {
  // Categorias pela ordem em que aparecem no template.
  const categorias = [...new Set(tarefas.map((t) => t.categoria))].map((categoria) => {
    const daCategoria = tarefas.filter((t) => t.categoria === categoria);
    return { categoria, total: daCategoria.length, feitas: daCategoria.filter((t) => t.estado === 'done').length };
  });
  return (
    <details className="progresso">
      <summary>{p.progressoCategorias}</summary>
      <ul>
        {categorias.map(({ categoria, total, feitas }) => (
          <li key={categoria}>
            <span>{categoria}</span>
            <span className="progresso__barra" aria-hidden="true">
              <span style={{ width: `${Math.round((feitas / total) * 100)}%` }} />
            </span>
            <span className="progresso__numeros">{p.feitasDe(feitas, total)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PainelFiltros({
  tarefas,
  membros,
  filtros,
  mudar,
}: {
  tarefas: TarefaProjecto[];
  membros: Pessoa[];
  filtros: Filtros;
  mudar: (f: Filtros) => void;
}) {
  const id = useId();
  const activos = filtrosActivos(filtros);
  const definir = (campo: keyof Filtros, valor: string | boolean) => mudar({ ...filtros, [campo]: valor === '' || valor === false ? undefined : valor });

  const escolha = (campo: 'fase' | 'categoria' | 'papel', rotulo: string) => (
    <div className="campo">
      <label htmlFor={`${id}-${campo}`}>{rotulo}</label>
      <select id={`${id}-${campo}`} value={filtros[campo] ?? ''} onChange={(evento) => definir(campo, evento.target.value)}>
        <option value="">{campo === 'papel' ? p.todos : p.todas}</option>
        {valoresDistintos(tarefas, campo).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <details className="filtros" open={activos > 0 || undefined}>
      <summary>{activos > 0 ? p.filtrosActivos(activos) : p.filtros}</summary>
      <div className="filtros__campos">
        {escolha('fase', p.fase)}
        {escolha('categoria', p.categoria)}
        {escolha('papel', p.papel)}
        <div className="campo">
          <label htmlFor={`${id}-estado`}>{p.estado}</label>
          <select id={`${id}-estado`} value={filtros.estado ?? ''} onChange={(evento) => definir('estado', evento.target.value)}>
            <option value="">{p.todos}</option>
            {ESTADOS_TAREFA.map((estado) => (
              <option key={estado} value={estado}>
                {p.estadoTarefa[estado]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-responsavel`}>{p.responsavel}</label>
          <select id={`${id}-responsavel`} value={filtros.responsavel ?? ''} onChange={(evento) => definir('responsavel', evento.target.value)}>
            <option value="">{p.todos}</option>
            <option value={RESPONSAVEL_EU}>{p.atribuidasAMim}</option>
            <option value={RESPONSAVEL_NINGUEM}>{p.semResponsavel}</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="escolha">
        <input type="checkbox" checked={filtros.soCriticas ?? false} onChange={(evento) => definir('soCriticas', evento.target.checked)} />
        <span>{p.soCriticas}</span>
      </label>
      <label className="escolha">
        <input type="checkbox" checked={filtros.soEmAtraso ?? false} onChange={(evento) => definir('soEmAtraso', evento.target.checked)} />
        <span>{p.soEmAtraso}</span>
      </label>
      {activos > 0 && (
        <button className="botao botao--secundario botao--compacto" type="button" onClick={() => mudar({})}>
          {p.limparFiltros}
        </button>
      )}
    </details>
  );
}

// Calendário do mês, com o número de tarefas em cada dia; ao tocar num dia, mostra as tarefas desse dia.
// Começa no mês de hoje (se o projecto o abranger) ou no primeiro mês com tarefas.
function Calendario({
  tarefas,
  todas,
  dataEvento,
  hoje,
  desenharTarefa,
}: {
  tarefas: TarefaProjecto[];
  todas: TarefaProjecto[];
  dataEvento: string;
  hoje: string;
  desenharTarefa: (t: TarefaProjecto) => ReactNode;
}) {
  const { primeiro, ultimo } = intervaloDeMeses(todas, dataEvento);
  const mesDeHoje = mesDe(hoje);
  const [mes, setMes] = useState(mesDeHoje >= primeiro && mesDeHoje <= ultimo ? mesDeHoje : primeiro);
  const [dia, setDia] = useState<string>();
  const [ano, numeroMes] = mes.split('-').map(Number) as [number, number];
  const doDia = dia ? tarefasNoDia(tarefas, dia) : [];

  return (
    <div className="calendario">
      <div className="calendario__cabecalho">
        <button
          className="botao botao--secundario botao--compacto"
          type="button"
          aria-label={p.mesAnterior}
          disabled={mes <= primeiro}
          onClick={() => setMes(somarMeses(mes, -1))}
        >
          ‹
        </button>
        <h3 aria-live="polite">
          {p.meses[numeroMes - 1]} {ano}
        </h3>
        <button
          className="botao botao--secundario botao--compacto"
          type="button"
          aria-label={p.mesSeguinte}
          disabled={mes >= ultimo}
          onClick={() => setMes(somarMeses(mes, 1))}
        >
          ›
        </button>
      </div>
      <table className="calendario__grelha">
        <thead>
          <tr>
            {p.diasDaSemana.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDoMes(mes).map((semana) => (
            <tr key={semana.find(Boolean)}>
              {semana.map((d, i) => {
                if (!d) return <td key={i} />;
                const n = tarefasNoDia(tarefas, d).length;
                const atraso = tarefasNoDia(tarefas, d).some((t) => t.emAtraso);
                const classes = [
                  'calendario__dia',
                  d === hoje && 'calendario__dia--hoje',
                  d === dataEvento && 'calendario__dia--evento',
                  d === dia && 'calendario__dia--escolhido',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={d}>
                    <button
                      type="button"
                      className={classes}
                      aria-pressed={d === dia}
                      aria-label={`${p.diaDoCalendario(formatarData(d), n)}${d === dataEvento ? ` · ${p.diaDoEvento}` : ''}${d === hoje ? ` · ${p.hoje}` : ''}`}
                      onClick={() => setDia(d)}
                    >
                      <span>{Number(d.slice(8))}</span>
                      {n > 0 && <span className={atraso ? 'calendario__n calendario__n--atraso' : 'calendario__n'}>{n}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendario__legenda campo__ajuda">
        <span className="calendario__marca calendario__marca--hoje" /> {p.hoje} · <span className="calendario__marca calendario__marca--evento" />{' '}
        {p.diaDoEvento}
      </p>
      {dia && (
        <div className="calendario__dia-escolhido">
          <h3>{p.tarefasDoDia(formatarData(dia))}</h3>
          {doDia.length === 0 ? <p className="campo__ajuda">{p.semTarefasNoDia}</p> : <ul className="tarefas">{doDia.map(desenharTarefa)}</ul>}
        </div>
      )}
    </div>
  );
}

interface PropsTarefa {
  tarefa: TarefaProjecto;
  // Quem pode ser responsável (donos e editores do projecto).
  membros: Pessoa[];
  soLeitura: boolean;
  arquivado: boolean;
  alterar: (alteracao: Alteracao) => Promise<void>;
}

function Tarefa({ tarefa: t, membros, soLeitura, arquivado, alterar }: PropsTarefa) {
  const id = useId();
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string>();
  // A caixa responde logo ao toque (redes lentas); se o servidor recusar, volta ao estado guardado.
  const [marcada, setMarcada] = useState<boolean>();

  async function guardar(alteracao: Alteracao) {
    setAGuardar(true);
    setErro(undefined);
    try {
      await alterar(alteracao);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAGuardar(false);
      setMarcada(undefined);
    }
  }

  const classes = ['tarefa', t.critica && 'tarefa--critica', t.estado === 'done' && 'tarefa--feita'].filter(Boolean).join(' ');
  // Um responsável que entretanto saiu do espaço continua a aparecer até ser trocado.
  const opcoes = t.responsavel && !membros.some((m) => m.id === t.responsavel!.id) ? [...membros, t.responsavel] : membros;

  return (
    <li className="tarefa-linha">
      <input
        className="tarefa__feita"
        type="checkbox"
        checked={marcada ?? t.estado === 'done'}
        disabled={soLeitura || aGuardar}
        aria-label={p.marcarConcluida(t.titulo)}
        onChange={(evento) => {
          setMarcada(evento.target.checked);
          guardar({ estado: evento.target.checked ? 'done' : 'pending' });
        }}
      />
      <details className={classes}>
        <summary>
          <span className="tarefa__titulo">{t.titulo}</span>
          <span className="tarefa__datas">
            {p.datas(formatarData(t.inicio), formatarData(t.fim))}
            {t.critica && <span className="etiqueta etiqueta--critica">{p.critica}</span>}
            {t.emAtraso && !arquivado && <span className="etiqueta etiqueta--atraso">{p.emAtraso}</span>}
            {t.estado !== 'pending' && <span className={`etiqueta etiqueta--${t.estado}`}>{p.estadoTarefa[t.estado]}</span>}
            {t.comprimida && <span className="etiqueta">{p.comprimida}</span>}
          </span>
          {t.responsavel && <span className="tarefa__responsavel">{t.responsavel.nome}</span>}
        </summary>
        {/* A nota é o conhecimento operacional do Eveni: em destaque, logo ao abrir a tarefa. */}
        {t.nota && (
          <div className="nota">
            <strong>{p.nota}</strong>
            <p>{t.nota}</p>
          </div>
        )}
        <p className="campo__ajuda">{p.categoriaPapel(t.categoria, t.papel)}</p>
        <div className="tarefa__campos">
          <div className="campo">
            <label htmlFor={`${id}-estado`}>{p.estado}</label>
            <select
              id={`${id}-estado`}
              value={t.estado}
              disabled={soLeitura || aGuardar}
              onChange={(evento) => guardar({ estado: evento.target.value as EstadoTarefa })}
            >
              {ESTADOS_TAREFA.map((estado) => (
                <option key={estado} value={estado}>
                  {p.estadoTarefa[estado]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor={`${id}-responsavel`}>{p.responsavel}</label>
            <select
              id={`${id}-responsavel`}
              value={t.responsavel?.id ?? ''}
              disabled={soLeitura || aGuardar}
              onChange={(evento) => guardar({ responsavelId: evento.target.value || null })}
            >
              <option value="">{p.ninguem}</option>
              {opcoes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div aria-live="polite">
          {aGuardar && <p className="campo__ajuda">{p.aGuardar}</p>}
          {erro && (
            <p className="campo__erro" role="alert">
              {erro}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
