import { useEffect, useId, useState } from 'react';
import { formatarData } from '../shared/datas.js';
import type { Avaliacao, AvaliacoesProjecto } from '../shared/fornecedores.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';

const q = mensagens.ecras.avaliacoes;

// Avaliação dos fornecedores de um projecto, a partir do dia do evento (decisão 019). Só para o dono e os
// editores (o servidor recusa os leitores).
export function AvaliarFornecedores({ projectoId }: { projectoId: string }) {
  const [dados, setDados] = useState<AvaliacoesProjecto>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<AvaliacoesProjecto>('GET', `/api/projectos/${encodeURIComponent(projectoId)}/avaliacoes`)
      .then(setDados)
      .catch((falha) => setErro(mensagemDeErro(falha)));
  }, [projectoId]);

  return (
    <section className="seccao" aria-labelledby="titulo-avaliar">
      <h2 id="titulo-avaliar">{q.titulo}</h2>
      <p className="campo__ajuda">{q.texto}</p>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {dados && !dados.aberta && <p className="aviso">{q.antesDoEvento(formatarData(dados.dataEvento))}</p>}
      {dados?.aberta && dados.fornecedores.length === 0 && <p className="campo__ajuda">{q.semFornecedores}</p>}
      {dados?.aberta && (
        <ul className="rubricas">
          {dados.fornecedores.map((f) => (
            <AvaliarUm key={f.id} projectoId={projectoId} fornecedor={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AvaliarUm({ projectoId, fornecedor: f }: { projectoId: string; fornecedor: AvaliacoesProjecto['fornecedores'][number] }) {
  const idComentario = useId();
  const [estrelas, setEstrelas] = useState(f.avaliacao?.estrelas ?? 0);
  const [comentario, setComentario] = useState(f.avaliacao?.comentario ?? '');
  const [aGuardar, setAGuardar] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const [erro, setErro] = useState<string>();

  async function guardar() {
    if (estrelas === 0) {
      setErro(q.escolhaEstrelas);
      return;
    }
    setAGuardar(true);
    setErro(undefined);
    setGuardada(false);
    try {
      const r = await api<Avaliacao>('POST', `/api/projectos/${encodeURIComponent(projectoId)}/avaliacoes/${f.id}`, { estrelas, comentario });
      setComentario(r.comentario ?? '');
      setGuardada(true);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <li className="avaliar">
      <p className="rubrica__descricao">
        {f.nome} <span className="etiqueta">{f.categoria}</span>
      </p>
      <fieldset className="estrelas">
        <legend className="so-leitores-de-ecra">{`${q.estrelas}: ${f.nome}`}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="estrelas__botao"
            aria-label={q.estrela(n)}
            aria-pressed={estrelas === n}
            onClick={() => {
              setEstrelas(n);
              setGuardada(false);
            }}
          >
            {n <= estrelas ? '★' : '☆'}
          </button>
        ))}
      </fieldset>
      <div className="campo">
        <label htmlFor={idComentario}>{q.comentario}</label>
        <textarea id={idComentario} className="colagem" rows={2} maxLength={500} value={comentario} onChange={(ev) => setComentario(ev.target.value)} />
      </div>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {guardada && (
        <p className="sucesso" role="status">
          {q.guardada}
        </p>
      )}
      <button className="botao botao--secundario" type="button" disabled={aGuardar} onClick={guardar}>
        {aGuardar ? q.aGuardar : q.guardar}
      </button>
    </li>
  );
}
