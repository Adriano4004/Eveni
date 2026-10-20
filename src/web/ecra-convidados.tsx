import { type ReactNode, useEffect, useId, useState } from 'react';
import {
  calcularTotais,
  type Convidado,
  formatarTelemovel,
  type LinhaColada,
  lerColagem,
  type ListaConvidados,
  MAX_LINHAS_IMPORTACAO,
  RESPOSTAS,
  type Resposta,
  type ResultadoImportacao,
} from '../shared/convidados.js';
import { dadosConvidado } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.ecras.convidados;

// Lista de convidados de um projecto (decisão 018). Quem só pode consultar (leitor, ou projecto arquivado)
// vê a lista sem formulários; o servidor recusa as alterações na mesma.
export function EcraConvidados({ id }: { id: string }) {
  const [lista, setLista] = useState<ListaConvidados>();
  const [erro, setErro] = useState<string>();
  const [procura, setProcura] = useState('');
  const [resposta, setResposta] = useState<Resposta | ''>('');
  const caminho = `/api/projectos/${encodeURIComponent(id)}/convidados`;

  const carregar = () =>
    api<ListaConvidados>('GET', caminho)
      .then(setLista)
      .catch((falha) => setErro(mensagemDeErro(falha)));

  useEffect(() => {
    carregar();
  }, [id]);

  // Substitui ou retira um convidado na lista local, com os totais recalculados.
  function mudarLocal(alterado: Convidado | { removido: string }) {
    setLista((actual) => {
      if (!actual) return actual;
      const convidados =
        'removido' in alterado ? actual.convidados.filter((c) => c.id !== alterado.removido) : actual.convidados.map((c) => (c.id === alterado.id ? alterado : c));
      return { ...actual, convidados, totais: calcularTotais(convidados) };
    });
  }

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar(`/projectos/${encodeURIComponent(id)}`)}>
      {q.voltar}
    </button>
  );

  if (!lista) {
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

  const termo = normalizar(procura);
  const visiveis = lista.convidados.filter((c) => (!resposta || c.resposta === resposta) && (!termo || normalizar(c.nome).includes(termo)));
  const filtrado = Boolean(termo || resposta);

  return (
    <main className="cartao cartao--largo">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="cartao__subtitulo">{lista.projecto.nome}</p>
      <p className="totais-convidados" aria-live="polite">
        {q.totais(lista.totais)}
      </p>
      {!lista.podeAlterar && <p className="aviso">{q.soLeitura}</p>}

      {lista.podeAlterar && (
        <Desdobravel titulo={q.acrescentar} aberto={lista.convidados.length === 0}>
          <Formulario
            botao={q.acrescentar}
            aEnviar={q.aAcrescentar}
            limparAoEnviar
            enviar={async (dados) => {
              await api<Convidado>('POST', caminho, dados);
              await carregar();
            }}
          >
            {(erros) => <CamposConvidado erros={erros} />}
          </Formulario>
        </Desdobravel>
      )}

      {lista.podeAlterar && (
        <Desdobravel titulo={q.importar} aberto={lista.convidados.length === 0}>
          <ImportarLista caminho={caminho} aoImportar={carregar} />
        </Desdobravel>
      )}

      <section className="seccao" aria-labelledby="titulo-lista">
        <h2 id="titulo-lista">{q.lista}</h2>
        {lista.convidados.length === 0 ? (
          <p className="campo__ajuda">{q.nenhum}</p>
        ) : (
          <>
            <div className="filtros-convidados">
              <div className="campo">
                <label htmlFor="procurar-convidado">{q.procurar}</label>
                <input id="procurar-convidado" type="search" autoComplete="off" value={procura} onChange={(ev) => setProcura(ev.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="filtro-resposta">{q.filtroResposta}</label>
                <select id="filtro-resposta" value={resposta} onChange={(ev) => setResposta(ev.target.value as Resposta | '')}>
                  <option value="">{q.todas}</option>
                  {RESPOSTAS.map((r) => (
                    <option key={r} value={r}>
                      {q.respostas[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filtrado && (
              <p className="campo__ajuda" aria-live="polite">
                {q.aMostrar(visiveis.length, lista.convidados.length)}
              </p>
            )}
            {visiveis.length === 0 && <p className="campo__ajuda">{q.nenhumComFiltro}</p>}
            <ul className="convidados">
              {visiveis.map((c) => (
                <LinhaConvidado key={c.id} convidado={c} caminho={caminho} podeAlterar={lista.podeAlterar} aoMudar={mudarLocal} />
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

// Secção que abre e fecha com um toque. Começa aberta só se `aberto` for verdade ao aparecer (ex.: lista
// vazia): depois disso fica como a pessoa a deixou, para não fechar o formulário a meio do trabalho.
function Desdobravel({ titulo, aberto, children }: { titulo: string; aberto: boolean; children: ReactNode }) {
  const [abertoAgora, setAberto] = useState(aberto);
  return (
    <details className="seccao desdobravel" open={abertoAgora} onToggle={(ev) => setAberto(ev.currentTarget.open)}>
      <summary>
        <h2>{titulo}</h2>
      </summary>
      {children}
    </details>
  );
}

// Para procurar sem ligar a maiúsculas nem acentos ("joao" encontra "João").
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function CamposConvidado({ erros, convidado }: { erros: Record<string, string>; convidado?: Convidado }) {
  return (
    <>
      <Campo rotulo={q.nome} nome="nome" autoComplete="off" erro={erros.nome} valorInicial={convidado?.nome} />
      <Campo
        rotulo={q.telemovel}
        nome="telemovel"
        tipo="tel"
        autoComplete="off"
        opcional
        erro={erros.telemovel}
        ajuda={q.ajudaTelemovel}
        valorInicial={convidado?.telemovel ? formatarTelemovel(convidado.telemovel) : undefined}
      />
      <Campo rotulo={q.email} nome="email" tipo="email" autoComplete="off" opcional erro={erros.email} valorInicial={convidado?.email ?? undefined} />
      <Campo
        rotulo={q.acompanhantes}
        nome="acompanhantes"
        autoComplete="off"
        numerico
        opcional
        erro={erros.acompanhantes}
        ajuda={q.ajudaAcompanhantes}
        valorInicial={String(convidado?.acompanhantes ?? 0)}
      />
    </>
  );
}

// Colar linhas do Excel: mostra o que vai entrar e as linhas com problemas antes de importar.
// Só se enviam as linhas sem problemas; o servidor volta a validar todas.
function ImportarLista({ caminho, aoImportar }: { caminho: string; aoImportar: () => Promise<void> }) {
  const idTexto = useId();
  const [texto, setTexto] = useState('');
  const [aImportar, setAImportar] = useState(false);
  const [erro, setErro] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoImportacao>();

  const linhas = lerColagem(texto);
  const validas: LinhaColada[] = [];
  const problemas: { linha: number; erro: string }[] = [];
  for (const l of linhas) {
    const r = dadosConvidado.safeParse(l);
    if (r.success) validas.push(l);
    else problemas.push({ linha: l.linha, erro: r.error.issues[0]!.message });
  }
  const demasiadas = validas.length > MAX_LINHAS_IMPORTACAO;

  async function importar() {
    setAImportar(true);
    setErro(undefined);
    try {
      const r = await api<ResultadoImportacao>('POST', `${caminho}/importar`, { linhas: validas });
      setResultado(r);
      setTexto('');
      await aoImportar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAImportar(false);
    }
  }

  return (
    <div className="importar">
      <p className="campo__ajuda">{q.importarTexto}</p>
      {resultado && (
        <div className="sucesso" role="status">
          <p>{q.importados(resultado.importados)}</p>
          {resultado.repetidos.length > 0 && (
            <>
              <p>{q.repetidos}</p>
              <ul>
                {resultado.repetidos.map((r) => (
                  <li key={r.linha}>{q.repetido(r.linha, r.nome)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="campo">
        <label htmlFor={idTexto}>{q.colar}</label>
        <textarea
          id={idTexto}
          className="colagem"
          rows={5}
          spellCheck={false}
          value={texto}
          onChange={(ev) => {
            setTexto(ev.target.value);
            setResultado(undefined);
          }}
        />
      </div>
      {linhas.length > 0 && (
        <div className="previa-importacao" aria-live="polite">
          <p>{q.prontos(validas.length)}</p>
          {problemas.length > 0 && (
            <div className="aviso aviso--alerta">
              <p>{q.comProblemas(problemas.length)}</p>
              <ul>
                {problemas.slice(0, 50).map((pr) => (
                  <li key={pr.linha}>{q.problema(pr.linha, pr.erro)}</li>
                ))}
              </ul>
            </div>
          )}
          {demasiadas && <p className="formulario__erro">{q.demasiadas(MAX_LINHAS_IMPORTACAO)}</p>}
        </div>
      )}
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {validas.length > 0 && !demasiadas && (
        <button className="botao" type="button" disabled={aImportar} onClick={importar}>
          {aImportar ? q.aImportar : q.importarBotao(validas.length)}
        </button>
      )}
    </div>
  );
}

interface PropsLinha {
  convidado: Convidado;
  caminho: string;
  podeAlterar: boolean;
  aoMudar: (c: Convidado | { removido: string }) => void;
}

// Um convidado: nome, resposta e contactos; ao abrir, os dados para alterar (dono e editores).
function LinhaConvidado({ convidado: c, caminho, podeAlterar, aoMudar }: PropsLinha) {
  const [erro, setErro] = useState<string>();
  const [guardado, setGuardado] = useState(false);
  const contactos = [c.telemovel && formatarTelemovel(c.telemovel), c.email].filter(Boolean).join(' · ');

  async function remover() {
    if (!confirm(q.confirmarRemover(c.nome))) return;
    setErro(undefined);
    try {
      await api('POST', `${caminho}/${c.id}/remover`);
      aoMudar({ removido: c.id });
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  return (
    <li className="convidado">
      <details>
        <summary>
          <span className="convidado__nome">{c.nome}</span>
          <span className={`etiqueta etiqueta--resposta-${c.resposta}`}>{q.respostas[c.resposta]}</span>
          <span className="campo__ajuda convidado__detalhe">
            {contactos || q.semContacto}
            {c.acompanhantes > 0 && ` · ${q.comAcompanhantes(c.acompanhantesConfirmados, c.acompanhantes, c.resposta)}`}
          </span>
        </summary>
        {podeAlterar && (
          <div className="convidado__editar">
            <Formulario
              botao={q.guardar}
              aEnviar={q.aGuardar}
              enviar={async (dados) => {
                setGuardado(false);
                const novo = await api<Convidado>('POST', `${caminho}/${c.id}`, dados);
                aoMudar(novo);
                setGuardado(true);
              }}
            >
              {(erros) => (
                <>
                  <CamposConvidado erros={erros} convidado={c} />
                  <EscolhaResposta valor={c.resposta} erro={erros.resposta} />
                  <Campo
                    rotulo={q.acompanhantesConfirmados}
                    nome="acompanhantesConfirmados"
                    autoComplete="off"
                    numerico
                    opcional
                    erro={erros.acompanhantesConfirmados}
                    valorInicial={String(c.acompanhantesConfirmados)}
                  />
                </>
              )}
            </Formulario>
            {guardado && (
              <p className="sucesso" role="status">
                {q.guardado}
              </p>
            )}
            {erro && (
              <p className="formulario__erro" role="alert">
                {erro}
              </p>
            )}
            <button className="botao botao--secundario botao--compacto" type="button" onClick={remover}>
              {q.remover}
            </button>
          </div>
        )}
      </details>
    </li>
  );
}

function EscolhaResposta({ valor, erro }: { valor: Resposta; erro?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{q.resposta}</label>
      <select id={id} name="resposta" defaultValue={valor} aria-invalid={erro ? true : undefined} aria-describedby={`${id}-ajuda`}>
        {RESPOSTAS.map((r) => (
          <option key={r} value={r}>
            {q.respostas[r]}
          </option>
        ))}
      </select>
      <p id={`${id}-ajuda`} className={erro ? 'campo__erro' : 'campo__ajuda'}>
        {erro ?? q.ajudaResposta}
      </p>
    </div>
  );
}
