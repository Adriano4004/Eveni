import { useEffect, useId, useState } from 'react';
import { formatarData } from '../shared/datas.js';
import { formatarKz } from '../shared/dinheiro.js';
import { mensagens } from '../shared/mensagens.js';
import { ESTADOS_TAREFA, type EstadoTarefa, type Pessoa, type Projecto, type TarefaProjecto } from '../shared/projectos.js';
import { api, mensagemDeErro } from './api.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;
const p = e.projecto;

type Alteracao = { estado?: EstadoTarefa; responsavelId?: string | null };

export function EcraProjecto({ id }: { id: string }) {
  const [projecto, setProjecto] = useState<Projecto>();
  const [erro, setErro] = useState<string>();

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
  // Fases pela ordem do template.
  const fases = [...new Set(projecto.tarefasDoProjecto.map((t) => t.fase))];

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

      {arquivado && <p className="aviso">{p.arquivado}</p>}
      {!arquivado && <AlertaAtrasos tarefas={projecto.tarefasDoProjecto} />}

      <section className="seccao" aria-labelledby="titulo-tarefas">
        <h2 id="titulo-tarefas">
          {p.tarefas} <span className="campo__ajuda">{e.projectos.progresso(projecto.concluidas, projecto.tarefas)}</span>
        </h2>
        <ProgressoCategorias tarefas={projecto.tarefasDoProjecto} />
        <p className="campo__ajuda">{p.emBreveTarefas}</p>
        {fases.map((fase) => (
          <div key={fase} className="fase">
            <h3>{fase}</h3>
            <ul className="tarefas">
              {projecto.tarefasDoProjecto
                .filter((t) => t.fase === fase)
                .map((t) => (
                  <Tarefa key={t.id} tarefa={t} membros={projecto.membros} soLeitura={arquivado} alterar={(a) => alterar(t, a)} />
                ))}
            </ul>
          </div>
        ))}
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
    </main>
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

interface PropsTarefa {
  tarefa: TarefaProjecto;
  membros: Pessoa[];
  soLeitura: boolean;
  alterar: (alteracao: Alteracao) => Promise<void>;
}

function Tarefa({ tarefa: t, membros, soLeitura, alterar }: PropsTarefa) {
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
            {t.emAtraso && !soLeitura && <span className="etiqueta etiqueta--atraso">{p.emAtraso}</span>}
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
