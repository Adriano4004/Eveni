import type { TotaisConvidados } from '../../shared/convidados.js';
import { formatarData, formatarDataEHora } from '../../shared/datas.js';
import { formatarKz } from '../../shared/dinheiro.js';
import { mensagens } from '../../shared/mensagens.js';
import { type EstadoOrcamento, resumirOrcamento } from '../../shared/orcamento.js';
import type { Projecto } from '../../shared/projectos.js';

// O que vai em cada relatório (decisão 020), separado do desenho do PDF: assim testa-se o conteúdo sem ler PDF.
// Os textos já vêm formatados para mostrar (datas dd/mm/aaaa, valores em Kz).

const q = mensagens.relatorios;

export interface LinhaOrcamento {
  descricao: string;
  previsto: string;
  real: string;
  // O real passa do previsto.
  acima: boolean;
}

export interface CategoriaRelatorio {
  categoria: string;
  previsto: string;
  real: string;
  itens: LinhaOrcamento[];
}

export interface RelatorioCliente {
  titulo: string;
  subtitulo: string;
  detalhes: [string, string][];
  geradoEm: string;
  progresso: { texto: string; percentagem: number };
  criticasEmAtraso: number;
  convidados: string | null;
  marcos: { titulo: string; prazo: string; estado: string; emAtraso: boolean }[];
  orcamento: {
    categorias: CategoriaRelatorio[];
    totais: [string, string][];
    estado: EstadoOrcamento;
    aviso: string | null;
  };
}

export function montarRelatorioCliente(projecto: Projecto, convidados: TotaisConvidados, agora: Date): RelatorioCliente {
  const resumo = resumirOrcamento(projecto.orcamento, projecto.contingencia);
  const percentagem = projecto.tarefas === 0 ? 0 : Math.round((projecto.concluidas / projecto.tarefas) * 100);
  const detalhes: [string, string][] = [
    [q.dataEvento, formatarData(projecto.dataEvento)],
    ...(projecto.local ? [[q.local, projecto.local] as [string, string]] : []),
    [q.tipo, projecto.nomeTemplate],
  ];
  return {
    titulo: projecto.nome,
    subtitulo: q.cliente.titulo,
    detalhes,
    geradoEm: q.geradoEm(formatarDataEHora(agora)),
    progresso: { texto: q.progresso(projecto.concluidas, projecto.tarefas, percentagem), percentagem },
    criticasEmAtraso: projecto.criticasEmAtraso,
    convidados: convidados.convidados === 0 ? null : q.convidados(convidados),
    // Tarefas críticas: os marcos que o cliente acompanha, pela ordem do prazo.
    marcos: projecto.tarefasDoProjecto
      .filter((t) => t.critica)
      .sort((a, b) => a.fim.localeCompare(b.fim))
      .map((t) => ({
        titulo: t.titulo,
        prazo: formatarData(t.fim),
        estado: t.emAtraso ? q.emAtraso : mensagens.ecras.projecto.estadoTarefa[t.estado],
        emAtraso: t.emAtraso,
      })),
    orcamento: {
      categorias: resumo.categorias.map((c) => ({
        categoria: c.categoria,
        previsto: formatarKz(c.previsto),
        real: formatarKz(c.real),
        itens: projecto.orcamento
          .filter((i) => i.categoria === c.categoria)
          .map((i) => ({ descricao: i.descricao, previsto: formatarKz(i.previstoCentimos), real: formatarKz(i.realCentimos), acima: i.realCentimos > i.previstoCentimos })),
      })),
      totais: [
        [q.subtotal, formatarKz(resumo.subtotalPrevisto)],
        [q.contingencia(projecto.contingencia), formatarKz(resumo.contingencia)],
        [q.totalPrevisto, formatarKz(resumo.totalPrevisto)],
        [q.totalReal, formatarKz(resumo.totalReal)],
      ],
      estado: resumo.estado,
      aviso:
        resumo.estado === 'excedido'
          ? q.excedido(formatarKz(resumo.totalReal - resumo.totalPrevisto))
          : resumo.estado === 'contingencia'
            ? q.aGastarContingencia(formatarKz(resumo.variacao))
            : null,
    },
  };
}
