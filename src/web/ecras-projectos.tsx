import { type FormEvent, useEffect, useId, useState } from 'react';
import { formatarData } from '../shared/datas.js';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { LIMITE_PROJECTOS, type Previsao, type ResumoProjecto, type ResumoTemplate } from '../shared/projectos.js';
import { api, ErroApi, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { navegar } from './navegacao.js';

const e = mensagens.ecras;

// Lista de projectos no ecrã de início.
export function ListaProjectos({ eu }: { eu: Eu }) {
  const p = e.projectos;
  const [projectos, setProjectos] = useState<ResumoProjecto[]>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<ResumoProjecto[]>('GET', '/api/projectos')
      .then(setProjectos)
      .catch(() => setErro(p.erroCarregar));
  }, []);

  const limite = LIMITE_PROJECTOS[eu.espaco.plano];
  const noLimite = limite !== null && projectos !== undefined && projectos.length >= limite;

  return (
    <section className="seccao seccao--primeira" aria-labelledby="titulo-projectos">
      <h2 id="titulo-projectos">{p.titulo}</h2>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {projectos?.length === 0 && <p className="cartao__subtitulo">{p.vazio}</p>}
      {projectos && projectos.length > 0 && (
        <ul className="projectos">
          {projectos.map((projecto) => (
            <li key={projecto.id}>
              <a
                className="projecto-cartao"
                href={`/projectos/${projecto.id}`}
                onClick={(evento) => {
                  evento.preventDefault();
                  navegar(`/projectos/${projecto.id}`);
                }}
              >
                <strong>{projecto.nome}</strong>
                <span>{p.evento(formatarData(projecto.dataEvento))}</span>
                <span className="projecto-cartao__progresso">{p.progresso(projecto.concluidas, projecto.tarefas)}</span>
                {projecto.criticasEmAtraso > 0 && projecto.estado === 'active' && (
                  <span className="etiqueta etiqueta--atraso">{p.criticasEmAtraso(projecto.criticasEmAtraso)}</span>
                )}
                {projecto.estado === 'archived' && <span className="etiqueta">{p.estado.archived}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!eu.emailConfirmado ? (
        <p className="campo__ajuda">{p.confirmarParaCriar}</p>
      ) : noLimite ? (
        <p className="campo__ajuda">{p.limiteAtingido(mensagens.planos[eu.espaco.plano], limite)}</p>
      ) : (
        projectos && (
          <button className="botao" type="button" onClick={() => navegar('/projectos/novo')}>
            {p.novo}
          </button>
        )
      )}
    </section>
  );
}

export function EcraNovoProjecto() {
  const n = e.novoProjecto;
  const idData = useId();
  const [templates, setTemplates] = useState<ResumoTemplate[]>();
  const [template, setTemplate] = useState<string>();
  const [dataEvento, setDataEvento] = useState('');
  const [previsao, setPrevisao] = useState<Previsao>();
  const [aVerificar, setAVerificar] = useState(false);
  const [aceitar, setAceitar] = useState(false);
  const [aCriar, setACriar] = useState(false);
  const [erroGeral, setErroGeral] = useState<string>();
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    api<ResumoTemplate[]>('GET', '/api/templates')
      .then((lista) => {
        setTemplates(lista);
        setTemplate(lista[0]?.codigo);
      })
      .catch((falha) => setErroGeral(mensagemDeErro(falha)));
  }, []);

  // Sempre que muda a data ou o tipo: ver os prazos antes de criar (os avisos aparecem aqui, não a D-30).
  useEffect(() => {
    setPrevisao(undefined);
    setAceitar(false);
    setErros((anteriores) => ({ ...anteriores, dataEvento: '' }));
    if (!template || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento)) return;
    let actual = true;
    setAVerificar(true);
    api<Previsao>('POST', '/api/projectos/previsao', { template, dataEvento })
      .then((p) => actual && setPrevisao(p))
      .catch((falha) => actual && falha instanceof ErroApi && setErros((anteriores) => ({ ...anteriores, ...falha.campos })))
      .finally(() => actual && setAVerificar(false));
    return () => {
      // Pedido anterior ignorado: o indicador não pode ficar preso se a data ficar vazia entretanto.
      actual = false;
      setAVerificar(false);
    };
  }, [template, dataEvento]);

  const temAvisos = (previsao?.avisos.length ?? 0) > 0;

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroGeral(undefined);
    setErros({});
    if (temAvisos && !aceitar) {
      setErros({ aceitarAvisos: n.aceitarObrigatorio });
      return;
    }
    const dados = new FormData(evento.currentTarget);
    setACriar(true);
    try {
      const { id } = await api<{ id: string }>('POST', '/api/projectos', {
        template,
        nome: String(dados.get('nome') ?? ''),
        dataEvento,
        local: String(dados.get('local') ?? ''),
        aceitarAvisos: aceitar,
      });
      navegar(`/projectos/${id}`);
    } catch (falha) {
      const campos = falha instanceof ErroApi ? falha.campos : {};
      setErros(campos);
      if (Object.keys(campos).length === 0) setErroGeral(mensagemDeErro(falha));
      setACriar(false);
    }
  }

  return (
    <main className="cartao">
      <h1>{n.titulo}</h1>
      <form className="formulario" onSubmit={criar} noValidate>
        {erroGeral && (
          <p className="formulario__erro" role="alert">
            {erroGeral}
          </p>
        )}
        {templates && (
          <fieldset className="escolhas">
            <legend>{n.tipo}</legend>
            {templates.map((t) => (
              <label key={t.codigo} className="escolha">
                <input type="radio" name="template" value={t.codigo} checked={template === t.codigo} onChange={() => setTemplate(t.codigo)} />
                <span>
                  <strong>{t.nome}</strong>
                  <span className="campo__ajuda">{n.resumoTipo(t.tarefas, t.criticas, t.diasNecessarios)}</span>
                </span>
              </label>
            ))}
            {erros.template && <p className="campo__erro">{erros.template}</p>}
          </fieldset>
        )}
        <Campo rotulo={n.nome} nome="nome" autoComplete="off" erro={erros.nome} ajuda={n.ajudaNome} />
        <div className="campo">
          <label htmlFor={idData}>{n.dataEvento}</label>
          <input
            id={idData}
            name="dataEvento"
            type="date"
            required
            value={dataEvento}
            onChange={(evento) => setDataEvento(evento.target.value)}
            aria-invalid={erros.dataEvento ? true : undefined}
            aria-describedby={erros.dataEvento ? `${idData}-erro` : undefined}
          />
          {erros.dataEvento && (
            <p id={`${idData}-erro`} className="campo__erro">
              {erros.dataEvento}
            </p>
          )}
        </div>
        <Campo rotulo={n.local} nome="local" autoComplete="off" erro={erros.local} opcional />

        <div aria-live="polite">
          {aVerificar && <p className="campo__ajuda">{n.aVerificar}</p>}
          {previsao && !previsao.comprimido && <p className="sucesso">{n.prazoSuficiente}</p>}
          {previsao?.comprimido && <p className="campo__ajuda">{n.comprimido(previsao.diasDisponiveis, previsao.diasNecessarios)}</p>}
          {previsao && temAvisos && (
            <div className="aviso aviso--alerta" role="alert">
              <h2>{n.avisosTitulo}</h2>
              <p>{n.avisosTexto}</p>
              <ul className="avisos">
                {previsao.avisos.map((a) => (
                  <li key={a.id}>
                    <strong>{a.titulo}</strong> — {n.aviso(formatarData(a.inicio), a.diasEmFalta)}
                  </li>
                ))}
              </ul>
              <label className="escolha">
                <input type="checkbox" checked={aceitar} onChange={(evento) => setAceitar(evento.target.checked)} />
                <span>{n.aceitar}</span>
              </label>
              {erros.aceitarAvisos && <p className="campo__erro">{erros.aceitarAvisos}</p>}
            </div>
          )}
        </div>

        <button className="botao" type="submit" disabled={aCriar || !templates}>
          {aCriar ? n.aCriar : n.botao}
        </button>
        <button className="botao botao--secundario" type="button" onClick={() => navegar('/')}>
          {n.cancelar}
        </button>
      </form>
    </main>
  );
}
