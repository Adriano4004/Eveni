import { useEffect, useId, useState } from 'react';
import { type Convidado, type ListaConvidados, lugaresDoConvidado, type Mesa, ocupacaoDasMesas } from '../shared/convidados.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Desdobravel } from './Desdobravel.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.ecras.mesas;
const rc = mensagens.ecras.convidados.respostas;

// Mesas de um projecto (decisão 018): criar mesas, sentar convidados e ver a ocupação de cada mesa.
// Usa a mesma resposta da lista de convidados (convidados e mesas num só pedido).
export function EcraMesas({ id }: { id: string }) {
  const [lista, setLista] = useState<ListaConvidados>();
  const [erro, setErro] = useState<string>();
  const caminho = `/api/projectos/${encodeURIComponent(id)}`;

  const carregar = () =>
    api<ListaConvidados>('GET', `${caminho}/convidados`)
      .then(setLista)
      .catch((falha) => setErro(mensagemDeErro(falha)));

  useEffect(() => {
    carregar();
  }, [id]);

  // Uma alteração e, a seguir, a lista de novo (a que conta é a do servidor).
  async function alterar(pedido: () => Promise<unknown>, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setErro(undefined);
    try {
      await pedido();
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }
  const sentar = (convidado: string, mesaId: string | null) => alterar(() => api('POST', `${caminho}/convidados/${convidado}/mesa`, { mesaId }));

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar(`/projectos/${encodeURIComponent(id)}`)}>
      {q.voltar}
    </button>
  );
  const mostrarErro = erro && (
    <p className="formulario__erro" role="alert">
      {erro}
    </p>
  );

  if (!lista) {
    return (
      <main className="cartao">
        {voltar}
        {mostrarErro || <p className="a-carregar">{q.carregar}</p>}
      </main>
    );
  }

  const ocupacao = ocupacaoDasMesas(lista.convidados);
  // Sem mesa: quem vai ou ainda não respondeu (quem não vai não precisa de lugar).
  const semMesa = lista.convidados.filter((c) => !c.mesaId && c.resposta !== 'no');
  const lugares = lista.mesas.reduce((s, m) => s + m.lugares, 0);
  const ocupados = [...ocupacao.values()].reduce((s, n) => s + n, 0);

  return (
    <main className="cartao cartao--largo">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="cartao__subtitulo">{lista.projecto.nome}</p>
      <p className="totais-convidados">{q.resumo(lista.mesas.length, lugares, ocupados, semMesa.length)}</p>
      <p className="campo__ajuda">{q.explicacao}</p>
      {!lista.podeAlterar && <p className="aviso">{q.soLeitura}</p>}
      {mostrarErro}

      {lista.podeAlterar && (
        <Desdobravel titulo={q.criar} aberto={lista.mesas.length === 0}>
          <h3>{q.umaMesa}</h3>
          <Formulario
            botao={q.criarUma}
            aEnviar={q.aCriar}
            limparAoEnviar
            enviar={async (dados) => {
              await api<Mesa>('POST', `${caminho}/mesas`, dados);
              await carregar();
            }}
          >
            {(erros) => (
              <>
                <Campo rotulo={q.nome} nome="nome" autoComplete="off" erro={erros.nome} ajuda={q.ajudaNome} />
                <Campo rotulo={q.lugares} nome="lugares" autoComplete="off" numerico erro={erros.lugares} valorInicial="10" />
              </>
            )}
          </Formulario>
          <h3>{q.variasMesas}</h3>
          <p className="campo__ajuda">{q.variasTexto}</p>
          <Formulario
            botao={q.criarVarias}
            aEnviar={q.aCriar}
            enviar={async (dados) => {
              await api<Mesa[]>('POST', `${caminho}/mesas/varias`, dados);
              await carregar();
            }}
          >
            {(erros) => (
              <>
                <Campo rotulo={q.quantidade} nome="quantidade" autoComplete="off" numerico erro={erros.quantidade} valorInicial="10" />
                <Campo rotulo={q.lugares} nome="lugares" autoComplete="off" numerico erro={erros.lugares} valorInicial="10" />
              </>
            )}
          </Formulario>
        </Desdobravel>
      )}

      <section className="seccao" aria-labelledby="titulo-sem-mesa">
        <h2 id="titulo-sem-mesa">
          {q.semMesa} <span className="campo__ajuda">({semMesa.length})</span>
        </h2>
        {lista.convidados.length > 0 && semMesa.length === 0 && <p className="campo__ajuda">{q.todosSentados}</p>}
        <ul className="convidados">
          {semMesa.map((c) => (
            <li key={c.id} className="sem-mesa">
              <span>
                <strong>{c.nome}</strong> <span className="campo__ajuda">{q.pessoas(lugaresDoConvidado(c))}</span>
              </span>
              {lista.podeAlterar && lista.mesas.length > 0 && (
                <EscolherMesa convidado={c} mesas={lista.mesas} ocupacao={ocupacao} aoEscolher={(mesa) => sentar(c.id, mesa)} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="seccao" aria-labelledby="titulo-mesas">
        <h2 id="titulo-mesas">{q.titulo}</h2>
        {lista.mesas.length === 0 && <p className="campo__ajuda">{q.semMesas}</p>}
        <ul className="mesas">
          {lista.mesas.map((mesa) => (
            <CartaoMesa
              key={mesa.id}
              mesa={mesa}
              ocupados={ocupacao.get(mesa.id) ?? 0}
              convidados={lista.convidados.filter((c) => c.mesaId === mesa.id)}
              podeAlterar={lista.podeAlterar}
              caminho={caminho}
              aoTirar={(convidado) => sentar(convidado, null)}
              aoMudar={carregar}
              aoApagar={() => alterar(() => api('POST', `${caminho}/mesas/${mesa.id}/remover`), q.confirmarApagar(mesa.nome))}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}

function EscolherMesa({ convidado, mesas, ocupacao, aoEscolher }: { convidado: Convidado; mesas: Mesa[]; ocupacao: Map<string, number>; aoEscolher: (mesa: string) => void }) {
  const id = useId();
  return (
    <span className="escolher-mesa">
      <label htmlFor={id} className="so-leitores-de-ecra">
        {q.sentarEm(convidado.nome)}
      </label>
      <select id={id} value="" onChange={(ev) => ev.target.value && aoEscolher(ev.target.value)}>
        <option value="">{q.escolherMesa}</option>
        {mesas.map((m) => (
          <option key={m.id} value={m.id}>
            {`${m.nome} (${q.ocupacao(ocupacao.get(m.id) ?? 0, m.lugares)})`}
          </option>
        ))}
      </select>
    </span>
  );
}

interface PropsMesa {
  mesa: Mesa;
  ocupados: number;
  convidados: Convidado[];
  podeAlterar: boolean;
  caminho: string;
  aoTirar: (convidado: string) => void;
  aoMudar: () => Promise<void>;
  aoApagar: () => void;
}

function CartaoMesa({ mesa, ocupados, convidados, podeAlterar, caminho, aoTirar, aoMudar, aoApagar }: PropsMesa) {
  const excedida = ocupados > mesa.lugares;
  return (
    <li className={`mesa${excedida ? ' mesa--excedida' : ''}`}>
      <div className="mesa__cabecalho">
        <h3>{mesa.nome}</h3>
        <span className={excedida ? 'mesa__ocupacao mesa__ocupacao--excedida' : 'mesa__ocupacao'}>
          {excedida ? q.excedida(ocupados, mesa.lugares) : q.ocupacao(ocupados, mesa.lugares)}
        </span>
      </div>
      {convidados.length === 0 ? (
        <p className="campo__ajuda">{q.vazia}</p>
      ) : (
        <ul className="mesa__convidados">
          {convidados.map((c) => (
            <li key={c.id}>
              <span>
                {c.nome} <span className="campo__ajuda">{q.pessoas(lugaresDoConvidado(c))}</span>
                {c.resposta === 'no' && <span className="etiqueta etiqueta--resposta-no">{rc.no}</span>}
              </span>
              {podeAlterar && (
                <button className="botao botao--secundario botao--compacto" type="button" aria-label={q.tirarDe(c.nome)} onClick={() => aoTirar(c.id)}>
                  {q.tirar}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeAlterar && (
        <details className="mesa__alterar">
          <summary>{q.alterarMesa}</summary>
          <Formulario
            botao={q.guardar}
            aEnviar={q.aGuardar}
            enviar={async (dados) => {
              await api<Mesa>('POST', `${caminho}/mesas/${mesa.id}`, dados);
              await aoMudar();
            }}
          >
            {(erros) => (
              <>
                <Campo rotulo={q.nome} nome="nome" autoComplete="off" erro={erros.nome} valorInicial={mesa.nome} />
                <Campo rotulo={q.lugares} nome="lugares" autoComplete="off" numerico erro={erros.lugares} valorInicial={String(mesa.lugares)} />
              </>
            )}
          </Formulario>
          <button className="botao botao--secundario botao--compacto" type="button" onClick={aoApagar}>
            {q.apagar}
          </button>
        </details>
      )}
    </li>
  );
}
