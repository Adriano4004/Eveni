import { useEffect, useId, useState } from 'react';
import { formatarTelemovel } from '../shared/convidados.js';
import type { Fornecedor } from '../shared/fornecedores.js';
import { mensagens } from '../shared/mensagens.js';
import { CATEGORIAS_ORCAMENTO } from '../shared/orcamento.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Desdobravel } from './Desdobravel.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.ecras.fornecedores;

// Fornecedores do espaço de trabalho de que a pessoa é dona (decisão 019).
export function EcraFornecedores() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>();
  const [erro, setErro] = useState<string>();
  const [procura, setProcura] = useState('');
  const [categoria, setCategoria] = useState('');

  const carregar = () =>
    api<Fornecedor[]>('GET', '/api/fornecedores')
      .then(setFornecedores)
      .catch((falha) => setErro(mensagemDeErro(falha)));

  useEffect(() => {
    carregar();
  }, []);

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar('/')}>
      {q.voltar}
    </button>
  );
  if (!fornecedores) {
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

  const termo = procura.trim().toLowerCase();
  const visiveis = fornecedores.filter((f) => (!categoria || f.categoria === categoria) && (!termo || f.nome.toLowerCase().includes(termo)));

  return (
    <main className="cartao cartao--largo">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="campo__ajuda">{q.texto}</p>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}

      <Desdobravel titulo={q.acrescentar} aberto={fornecedores.length === 0}>
        <Formulario
          botao={q.acrescentar}
          aEnviar={q.aAcrescentar}
          limparAoEnviar
          enviar={async (dados) => {
            await api<Fornecedor>('POST', '/api/fornecedores', dados);
            await carregar();
          }}
        >
          {(erros) => <CamposFornecedor erros={erros} />}
        </Formulario>
      </Desdobravel>

      <section className="seccao" aria-labelledby="titulo-lista-fornecedores">
        <h2 id="titulo-lista-fornecedores">{q.titulo}</h2>
        {fornecedores.length === 0 ? (
          <p className="campo__ajuda">{q.nenhum}</p>
        ) : (
          <>
            <div className="filtros-convidados">
              <div className="campo">
                <label htmlFor="procurar-fornecedor">{q.procurar}</label>
                <input id="procurar-fornecedor" type="search" autoComplete="off" value={procura} onChange={(ev) => setProcura(ev.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="filtro-categoria">{q.categoria}</label>
                <select id="filtro-categoria" value={categoria} onChange={(ev) => setCategoria(ev.target.value)}>
                  <option value="">{q.todas}</option>
                  {CATEGORIAS_ORCAMENTO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {visiveis.length === 0 && <p className="campo__ajuda">{q.nenhumComFiltro}</p>}
            <ul className="convidados">
              {visiveis.map((f) => (
                <LinhaFornecedor
                  key={f.id}
                  fornecedor={f}
                  aoMudar={(novo) => setFornecedores((l) => l?.map((x) => (x.id === novo.id ? novo : x)))}
                  aoApagar={async () => {
                    if (!confirm(q.confirmarApagar(f.nome))) return;
                    setErro(undefined);
                    try {
                      await api('POST', `/api/fornecedores/${f.id}/remover`);
                      await carregar();
                    } catch (falha) {
                      setErro(mensagemDeErro(falha));
                    }
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

function LinhaFornecedor({ fornecedor: f, aoMudar, aoApagar }: { fornecedor: Fornecedor; aoMudar: (f: Fornecedor) => void; aoApagar: () => void }) {
  const [guardado, setGuardado] = useState(false);
  const contactos = [f.telemovel && formatarTelemovel(f.telemovel), f.email].filter(Boolean).join(' · ');
  return (
    <li className="convidado">
      <details>
        <summary>
          <span className="convidado__nome">{f.nome}</span>
          <span className="etiqueta">{f.categoria}</span>
          {contactos && <span className="campo__ajuda convidado__detalhe">{contactos}</span>}
        </summary>
        <div className="convidado__editar">
          {f.notas && <p className="nota nota--texto">{f.notas}</p>}
          {f.telemovel && (
            <div className="botoes-lado-a-lado">
              <a className="botao botao--secundario botao--ligacao" href={`tel:${f.telemovel}`}>
                {q.ligar}
              </a>
              <a className="botao botao--secundario botao--ligacao" href={`https://wa.me/${f.telemovel.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">
                {q.whatsapp}
              </a>
            </div>
          )}
          <Formulario
            botao={q.guardar}
            aEnviar={q.aGuardar}
            enviar={async (dados) => {
              setGuardado(false);
              aoMudar(await api<Fornecedor>('POST', `/api/fornecedores/${f.id}`, dados));
              setGuardado(true);
            }}
          >
            {(erros) => <CamposFornecedor erros={erros} fornecedor={f} />}
          </Formulario>
          {guardado && (
            <p className="sucesso" role="status">
              {q.guardado}
            </p>
          )}
          <button className="botao botao--secundario botao--compacto" type="button" onClick={aoApagar}>
            {q.apagar}
          </button>
        </div>
      </details>
    </li>
  );
}

// Campos de um fornecedor: usados aqui e no orçamento (acrescentar a partir de um projecto).
export function CamposFornecedor({ erros, fornecedor }: { erros: Record<string, string>; fornecedor?: Fornecedor }) {
  const idCategoria = useId();
  const idNotas = useId();
  return (
    <>
      <Campo rotulo={q.nome} nome="nome" autoComplete="off" erro={erros.nome} valorInicial={fornecedor?.nome} />
      <div className="campo">
        <label htmlFor={idCategoria}>{q.categoria}</label>
        <select id={idCategoria} name="categoria" defaultValue={fornecedor?.categoria ?? CATEGORIAS_ORCAMENTO[0]} aria-invalid={erros.categoria ? true : undefined}>
          {CATEGORIAS_ORCAMENTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {erros.categoria && <p className="campo__erro">{erros.categoria}</p>}
      </div>
      <Campo
        rotulo={q.telemovel}
        nome="telemovel"
        tipo="tel"
        autoComplete="off"
        opcional
        erro={erros.telemovel}
        valorInicial={fornecedor?.telemovel ? formatarTelemovel(fornecedor.telemovel) : undefined}
      />
      <Campo rotulo={q.email} nome="email" tipo="email" autoComplete="off" opcional erro={erros.email} valorInicial={fornecedor?.email ?? undefined} />
      <div className="campo">
        <label htmlFor={idNotas}>{q.notas}</label>
        <textarea
          id={idNotas}
          name="notas"
          className="colagem"
          rows={3}
          defaultValue={fornecedor?.notas ?? ''}
          aria-invalid={erros.notas ? true : undefined}
          aria-describedby={`${idNotas}-ajuda`}
        />
        <p id={`${idNotas}-ajuda`} className={erros.notas ? 'campo__erro' : 'campo__ajuda'}>
          {erros.notas ?? q.ajudaNotas}
        </p>
      </div>
    </>
  );
}
