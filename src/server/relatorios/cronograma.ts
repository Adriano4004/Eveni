import { mensagens } from '../../shared/mensagens.js';
import type { RelatorioCronograma } from './modelo.js';
import { cabecalho, criarDocumento, type MarcaPdf, paragrafo, seccao, tabela, terminar } from './pdf.js';

const q = mensagens.relatorios;

// Cronograma (decisão 020): uma tabela por semana, com as tarefas pela data de início.
export function desenharCronograma(r: RelatorioCronograma, marca?: MarcaPdf | null): Promise<Buffer> {
  const doc = criarDocumento(`${r.titulo} — ${r.subtitulo}`, marca);
  cabecalho(doc, r.titulo, r.subtitulo, r.detalhes, r.geradoEm);
  paragrafo(doc, r.progresso.texto);
  paragrafo(doc, q.legendaCronograma);

  for (const s of r.semanas) {
    seccao(doc, s.doEvento ? `${s.titulo} · ${q.semanaDoEvento}` : s.titulo);
    tabela(
      doc,
      [
        { titulo: q.datas, largura: 0.2 },
        { titulo: q.relativo, largura: 0.08 },
        { titulo: q.tarefa, largura: 0.42 },
        { titulo: q.responsavel, largura: 0.16 },
        { titulo: q.estado, largura: 0.14 },
      ],
      s.tarefas.map((t) => [t.datas, t.relativo, `${t.critica ? `[${q.critica}] ` : ''}${t.titulo}`, t.responsavel, t.estado]),
      { destaque: (i) => s.tarefas[i]!.emAtraso, negrito: (i) => s.tarefas[i]!.relativo === 'D0' },
    );
  }
  return terminar(doc);
}
