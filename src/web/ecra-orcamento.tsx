import { useEffect, useId, useState } from 'react';
import { formatarKz } from '../shared/dinheiro.js';
import { mensagens } from '../shared/mensagens.js';
import { CATEGORIAS_ORCAMENTO, kzParaCampo, resumirOrcamento } from '../shared/orcamento.js';
import type { Fornecedor } from '../shared/fornecedores.js';
import type { ItemOrcamento, Projecto } from '../shared/projectos.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Desdobravel } from './Desdobravel.js';
import { AvaliarFornecedores } from './AvaliarFornecedores.js';
import { CamposFornecedor } from './ecra-fornecedores.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.ecras.orcamento;

// Orçamento de um projecto (decisão 019): previsto e real por rubrica, totais por categoria, contingência e
// alertas quando o real passa do previsto. Os totais calculam-se no ecrã com o mesmo código do servidor.
export function EcraOrcamento({ id }: { id: string }) {
  const [projecto, setProjecto] = useState<Projecto>();
  const [erro, setErro] = useState<string>();
  // Fornecedores do espaço do projecto, para escolher nas rubricas (só dono e editores os recebem).
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorCriado, setFornecedorCriado] = useState<string>();
  const caminho = `/api/projectos/${encodeURIComponent(id)}`;

  const carregar = () =>
    api<Projecto>('GET', caminho)
      .then(setProjecto)
      .catch((falha) => setErro(mensagemDeErro(falha)));
  const carregarFornecedores = () =>
    api<Fornecedor[]>('GET', `${caminho}/fornecedores`)
      .then(setFornecedores)
      .catch(() => setFornecedores([]));

  useEffect(() => {
    carregar();
  }, [id]);
  const podeEscolher = projecto && projecto.papel !== 'viewer' && projecto.estado === 'active';
  useEffect(() => {
    if (podeEscolher) carregarFornecedores();
  }, [podeEscolher]);

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar(`/projectos/${encodeURIComponent(id)}`)}>
      {q.voltar}
    </button>
  );
  if (!projecto) {
    return (
      <main className="cartao">
        {voltar}
        {erro ? (
          <p className="formulario__erro" role="alert">
            {erro}
          </p>
        ) : (
          <p className="a-carregar">{mensagens.ecras.carregar}</p>
        )}
      </main>
    );
  }

  const podeAlterar = projecto.papel !== 'viewer' && projecto.estado === 'active';
  const resumo = resumirOrcamento(projecto.orcamento, projecto.contingencia);
  // Substitui a rubrica pela versão devolvida pelo servidor.
  const mudarItem = (novo: ItemOrcamento) =>
    setProjecto((p) => (p ? { ...p, orcamento: p.orcamento.map((i) => (i.id === novo.id ? novo : i)) } : p));

  return (
    <main className="cartao cartao--largo">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="cartao__subtitulo">{projecto.nome}</p>
      {!podeAlterar && <p className="aviso">{q.soLeitura}</p>}

      <dl className="resumo-orcamento">
        <div>
          <dt>{q.subtotal}</dt>
          <dd>{formatarKz(resumo.subtotalPrevisto)}</dd>
        </div>
        <div>
          <dt>{q.contingencia(projecto.contingencia)}</dt>
          <dd>{formatarKz(resumo.contingencia)}</dd>
        </div>
        <div className="resumo-orcamento__total">
          <dt>{q.totalPrevisto}</dt>
          <dd>{formatarKz(resumo.totalPrevisto)}</dd>
        </div>
        <div className="resumo-orcamento__total">
          <dt>{q.totalReal}</dt>
          <dd>{formatarKz(resumo.totalReal)}</dd>
        </div>
      </dl>
      {resumo.estado === 'contingencia' && <p className="aviso">{q.estadoContingencia(formatarKz(resumo.variacao))}</p>}
      {resumo.estado === 'excedido' && (
        <p className="aviso aviso--alerta" role="alert">
          {q.estadoExcedido(formatarKz(resumo.totalReal - resumo.totalPrevisto))}
        </p>
      )}
      {resumo.rubricasExcedidas > 0 && <p className="campo__ajuda">{q.rubricasExcedidas(resumo.rubricasExcedidas)}</p>}

      {podeAlterar && (
        <Formulario
          botao={q.guardar}
          aEnviar={q.aGuardar}
          enviar={async (dados) => {
            const r = await api<{ contingencia: number }>('POST', `${caminho}/contingencia`, { percentagem: dados.percentagem });
            setProjecto((p) => (p ? { ...p, contingencia: r.contingencia } : p));
          }}
        >
          {(erros) => (
            <Campo
              rotulo={q.percentagem}
              nome="percentagem"
              autoComplete="off"
              numerico
              erro={erros.percentagem}
              ajuda={q.ajudaPercentagem}
              valorInicial={String(projecto.contingencia)}
            />
          )}
        </Formulario>
      )}

      {resumo.categorias.map((cat) => (
        <section key={cat.categoria} className="seccao categoria-orcamento" aria-label={cat.categoria}>
          <h2>{cat.categoria}</h2>
          <p className={cat.variacao > 0 ? 'campo__ajuda categoria-orcamento--excedida' : 'campo__ajuda'}>
            {q.categoriaTotais(formatarKz(cat.previsto), formatarKz(cat.real))}
          </p>
          <ul className="rubricas">
            {projecto.orcamento
              .filter((i) => i.categoria === cat.categoria)
              .map((i) => (
                <Rubrica
                  key={i.id}
                  item={i}
                  fornecedores={fornecedores}
                  caminho={caminho}
                  podeAlterar={podeAlterar}
                  aoMudar={mudarItem}
                  aoRemover={async () => {
                    if (!confirm(q.confirmarRemover(i.descricao))) return;
                    setErro(undefined);
                    try {
                      await api('POST', `${caminho}/orcamento/${i.id}/remover`);
                      await carregar();
                    } catch (falha) {
                      setErro(mensagemDeErro(falha));
                    }
                  }}
                />
              ))}
          </ul>
        </section>
      ))}
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}

      {podeAlterar && (
        <Desdobravel titulo={q.acrescentar} aberto={false}>
          <Formulario
            botao={q.acrescentar}
            aEnviar={q.aAcrescentar}
            limparAoEnviar
            enviar={async (dados) => {
              await api<ItemOrcamento>('POST', `${caminho}/orcamento`, dados);
              await carregar();
            }}
          >
            {(erros) => <CamposRubrica erros={erros} fornecedores={fornecedores} />}
          </Formulario>
        </Desdobravel>
      )}

      {podeAlterar && (
        <Desdobravel titulo={q.fornecedorNovo} aberto={false}>
          <p className="campo__ajuda">{q.fornecedorNovoTexto}</p>
          {fornecedorCriado && (
            <p className="sucesso" role="status">
              {q.fornecedorCriado(fornecedorCriado)}
            </p>
          )}
          <Formulario
            botao={q.fornecedorNovo}
            aEnviar={q.aAcrescentar}
            limparAoEnviar
            enviar={async (dados) => {
              const f = await api<Fornecedor>('POST', `${caminho}/fornecedores`, dados);
              setFornecedorCriado(f.nome);
              await carregarFornecedores();
            }}
          >
            {(erros) => <CamposFornecedor erros={erros} />}
          </Formulario>
        </Desdobravel>
      )}
      {projecto.papel !== 'viewer' && <AvaliarFornecedores projectoId={projecto.id} />}
    </main>
  );
}

function EscolhaCategoria({ valor, erro }: { valor?: string; erro?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{q.categoria}</label>
      <select id={id} name="categoria" defaultValue={valor ?? CATEGORIAS_ORCAMENTO[0]} aria-invalid={erro ? true : undefined}>
        {CATEGORIAS_ORCAMENTO.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {erro && <p className="campo__erro">{erro}</p>}
    </div>
  );
}

// Campos de uma rubrica. Nas obrigatórias do template, a categoria e a descrição não mudam: vão escondidas.
function CamposRubrica({ erros, item, fornecedores }: { erros: Record<string, string>; item?: ItemOrcamento; fornecedores: Fornecedor[] }) {
  return (
    <>
      {item?.obrigatoria ? (
        <>
          <input type="hidden" name="categoria" value={item.categoria} />
          <input type="hidden" name="descricao" value={item.descricao} />
        </>
      ) : (
        <>
          <EscolhaCategoria valor={item?.categoria} erro={erros.categoria} />
          <Campo rotulo={q.descricao} nome="descricao" autoComplete="off" erro={erros.descricao} valorInicial={item?.descricao} />
        </>
      )}
      <Campo
        rotulo={q.valorPrevisto}
        nome="previsto"
        autoComplete="off"
        numerico
        opcional
        erro={erros.previsto}
        ajuda={q.ajudaValor}
        valorInicial={item ? kzParaCampo(item.previstoCentimos) : undefined}
      />
      <Campo
        rotulo={q.valorReal}
        nome="real"
        autoComplete="off"
        numerico
        opcional
        erro={erros.real}
        valorInicial={item ? kzParaCampo(item.realCentimos) : undefined}
      />
      <EscolhaFornecedor fornecedores={fornecedores} actual={item?.fornecedor ?? null} erro={erros.fornecedorId} />
    </>
  );
}

// Fornecedores do espaço. O fornecedor actual da rubrica está sempre entre as opções, mesmo antes de a lista
// chegar: senão o campo mostraria "Nenhum" e guardar tirava-o da rubrica.
function EscolhaFornecedor({ fornecedores, actual, erro }: { fornecedores: Fornecedor[]; actual: { id: string; nome: string } | null; erro?: string }) {
  const id = useId();
  const opcoes = actual && !fornecedores.some((f) => f.id === actual.id) ? [{ id: actual.id, rotulo: actual.nome }] : [];
  opcoes.push(...fornecedores.map((f) => ({ id: f.id, rotulo: `${f.nome} (${f.categoria})` })));
  return (
    <div className="campo">
      <label htmlFor={id}>{q.fornecedor}</label>
      <select id={id} name="fornecedorId" defaultValue={actual?.id ?? ''} aria-invalid={erro ? true : undefined}>
        <option value="">{q.nenhumFornecedor}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {erro && <p className="campo__erro">{erro}</p>}
    </div>
  );
}

interface PropsRubrica {
  item: ItemOrcamento;
  fornecedores: Fornecedor[];
  caminho: string;
  podeAlterar: boolean;
  aoMudar: (i: ItemOrcamento) => void;
  aoRemover: () => void;
}

function Rubrica({ item: i, fornecedores, caminho, podeAlterar, aoMudar, aoRemover }: PropsRubrica) {
  const [guardado, setGuardado] = useState(false);
  const acima = i.realCentimos > i.previstoCentimos;
  return (
    <li className={`rubrica${acima ? ' rubrica--acima' : ''}`}>
      <details>
        <summary>
          <span className="rubrica__descricao">
            {i.descricao}
            {i.obrigatoria && <span className="etiqueta">{q.obrigatoria}</span>}
            {acima && <span className="etiqueta etiqueta--atraso">{q.acimaDoPrevisto}</span>}
          </span>
          <span className="rubrica__valores">
            <span>
              {q.previsto}: {formatarKz(i.previstoCentimos)}
            </span>
            <span>
              {q.real}: {formatarKz(i.realCentimos)}
            </span>
          </span>
          {i.fornecedor && <span className="rubrica__fornecedor">{i.fornecedor.nome}</span>}
        </summary>
        <div className="rubrica__corpo">
          {i.nota && (
            <p className="nota">
              <strong>{q.nota}:</strong> {i.nota}
            </p>
          )}
          {podeAlterar && (
            <>
              <Formulario
                botao={q.guardar}
                aEnviar={q.aGuardar}
                enviar={async (dados) => {
                  setGuardado(false);
                  aoMudar(await api<ItemOrcamento>('POST', `${caminho}/orcamento/${i.id}`, dados));
                  setGuardado(true);
                }}
              >
                {(erros) => <CamposRubrica erros={erros} item={i} fornecedores={fornecedores} />}
              </Formulario>
              {guardado && (
                <p className="sucesso" role="status">
                  {q.guardado}
                </p>
              )}
              {!i.obrigatoria && (
                <button className="botao botao--secundario botao--compacto" type="button" onClick={aoRemover}>
                  {q.remover}
                </button>
              )}
            </>
          )}
        </div>
      </details>
    </li>
  );
}
