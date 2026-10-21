import { mensagens } from '../../shared/mensagens.js';
import type { RelatorioInterno } from './modelo.js';
import { cabecalho, criarDocumento, paragrafo, seccao, tabela, terminar, totais } from './pdf.js';

const q = mensagens.relatorios;

// Relatório interno (decisão 020): para a equipa, não para o cliente. Tarefas com responsável e nota,
// orçamento com fornecedor, fornecedores com contactos e avaliação, convidados com telemóvel e mesa.
export function desenharRelatorioInterno(r: RelatorioInterno): Promise<Buffer> {
  const doc = criarDocumento(`${r.titulo} — ${r.subtitulo}`);
  cabecalho(doc, r.titulo, r.subtitulo, r.detalhes, r.geradoEm);

  seccao(doc, q.resumo);
  paragrafo(doc, r.progresso.texto);
  paragrafo(doc, r.criticasEmAtraso > 0 ? q.criticasEmAtraso(r.criticasEmAtraso) : q.semAtrasos, { alerta: r.criticasEmAtraso > 0 });
  if (r.convidados) paragrafo(doc, r.convidados);

  seccao(doc, q.equipa);
  tabela(
    doc,
    [
      { titulo: q.convidado, largura: 0.7 },
      { titulo: q.acesso, largura: 0.3 },
    ],
    r.equipa,
  );

  for (const f of r.fases) {
    seccao(doc, `${q.tarefas} · ${f.fase}`);
    // A nota (o conhecimento operacional) vai por baixo do título, na mesma célula.
    tabela(
      doc,
      [
        { titulo: q.tarefa, largura: 0.5 },
        { titulo: q.prazo, largura: 0.18 },
        { titulo: q.responsavel, largura: 0.17 },
        { titulo: q.estado, largura: 0.15 },
      ],
      f.tarefas.map((t) => [`${t.critica ? `[${q.critica}] ` : ''}${t.titulo}${t.nota ? `\n${q.nota}: ${t.nota}` : ''}`, t.prazo, t.responsavel, t.estado]),
      { destaque: (i) => f.tarefas[i]!.emAtraso },
    );
  }

  seccao(doc, q.orcamento);
  const linhas: { celulas: string[]; acima: boolean; total: boolean }[] = [];
  for (const c of r.orcamento.categorias) {
    linhas.push({ celulas: [c.categoria, '', c.previsto, c.real], acima: false, total: true });
    for (const i of c.itens) linhas.push({ celulas: [`   ${i.descricao}`, i.fornecedor, i.previsto, i.real], acima: i.acima, total: false });
  }
  tabela(
    doc,
    [
      { titulo: q.rubrica, largura: 0.36 },
      { titulo: q.fornecedor, largura: 0.24 },
      { titulo: q.previsto, largura: 0.2, alinhar: 'right' },
      { titulo: q.real, largura: 0.2, alinhar: 'right' },
    ],
    linhas.map((l) => l.celulas),
    { destaque: (i) => linhas[i]!.acima, negrito: (i) => linhas[i]!.total },
  );
  totais(doc, r.orcamento.totais);
  if (r.orcamento.aviso) paragrafo(doc, r.orcamento.aviso, { alerta: r.orcamento.estado === 'excedido', negrito: true });

  seccao(doc, q.fornecedores);
  if (r.fornecedores.length === 0) paragrafo(doc, q.semFornecedores);
  else
    tabela(
      doc,
      [
        { titulo: q.fornecedor, largura: 0.34 },
        { titulo: q.contactos, largura: 0.38 },
        { titulo: q.avaliacao, largura: 0.28 },
      ],
      r.fornecedores.map((f) => [`${f.nome}\n${f.categoria}${f.notas ? `\n${f.notas}` : ''}`, f.contactos, f.avaliacao]),
    );

  seccao(doc, q.listaConvidados);
  if (r.listaConvidados.length === 0) paragrafo(doc, q.semConvidados);
  else
    tabela(
      doc,
      [
        { titulo: q.convidado, largura: 0.34 },
        { titulo: q.telemovel, largura: 0.22 },
        { titulo: q.resposta, largura: 0.16 },
        { titulo: q.acompanhantes, largura: 0.1, alinhar: 'right' },
        { titulo: q.mesa, largura: 0.18 },
      ],
      r.listaConvidados.map((c) => [c.nome, c.telemovel, c.resposta, c.acompanhantes, c.mesa]),
    );

  return terminar(doc);
}
