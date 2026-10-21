import { mensagens } from '../../shared/mensagens.js';
import type { RelatorioCliente } from './modelo.js';
import { cabecalho, criarDocumento, type MarcaPdf, paragrafo, seccao, tabela, terminar, totais } from './pdf.js';

const q = mensagens.relatorios;

// Relatório para o cliente (decisão 020): resumo, marcos (tarefas críticas) e orçamento com previsto e real.
// Sem notas internas, sem fornecedores, sem a equipa.
export function desenharRelatorioCliente(r: RelatorioCliente, marca?: MarcaPdf | null): Promise<Buffer> {
  const doc = criarDocumento(`${r.titulo} — ${r.subtitulo}`, marca);
  cabecalho(doc, r.titulo, r.subtitulo, r.detalhes, r.geradoEm);

  seccao(doc, q.resumo);
  paragrafo(doc, r.progresso.texto);
  paragrafo(doc, r.criticasEmAtraso > 0 ? q.criticasEmAtraso(r.criticasEmAtraso) : q.semAtrasos, { alerta: r.criticasEmAtraso > 0 });
  if (r.convidados) paragrafo(doc, r.convidados);

  if (r.marcos.length > 0) {
    seccao(doc, q.marcos);
    tabela(
      doc,
      [
        { titulo: q.tarefa, largura: 0.62 },
        { titulo: q.prazo, largura: 0.18 },
        { titulo: q.estado, largura: 0.2 },
      ],
      r.marcos.map((m) => [m.titulo, m.prazo, m.estado]),
      { destaque: (i) => r.marcos[i]!.emAtraso },
    );
  }

  seccao(doc, q.orcamento);
  // Uma linha por rubrica e, a negrito, o total de cada categoria.
  const linhas: { celulas: string[]; acima: boolean; total: boolean }[] = [];
  for (const c of r.orcamento.categorias) {
    linhas.push({ celulas: [c.categoria, c.previsto, c.real], acima: false, total: true });
    for (const i of c.itens) linhas.push({ celulas: [`   ${i.descricao}`, i.previsto, i.real], acima: i.acima, total: false });
  }
  tabela(
    doc,
    [
      { titulo: q.rubrica, largura: 0.5 },
      { titulo: q.previsto, largura: 0.25, alinhar: 'right' },
      { titulo: q.real, largura: 0.25, alinhar: 'right' },
    ],
    linhas.map((l) => l.celulas),
    { destaque: (i) => linhas[i]!.acima, negrito: (i) => linhas[i]!.total },
  );
  totais(doc, r.orcamento.totais);
  if (r.orcamento.aviso) paragrafo(doc, r.orcamento.aviso, { alerta: r.orcamento.estado === 'excedido', negrito: true });

  return terminar(doc);
}
