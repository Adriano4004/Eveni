import { calcularTotais, type Convidado, formatarTelemovel, type Mesa, type TotaisConvidados } from '../../shared/convidados.js';
import { diasEntre, formatarData, formatarDataEHora, somarDias } from '../../shared/datas.js';
import { formatarKz } from '../../shared/dinheiro.js';
import { type Fornecedor, formatarMedia } from '../../shared/fornecedores.js';
import { mensagens } from '../../shared/mensagens.js';
import { type EstadoOrcamento, resumirOrcamento } from '../../shared/orcamento.js';
import type { Projecto } from '../../shared/projectos.js';
import { diaDaSemana } from '../../shared/vistas.js';

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

export interface TarefaInterna {
  titulo: string;
  prazo: string;
  responsavel: string;
  estado: string;
  critica: boolean;
  emAtraso: boolean;
  nota: string | null;
}

export interface RelatorioInterno extends Omit<RelatorioCliente, 'marcos' | 'orcamento'> {
  equipa: [string, string][];
  // Por fase, pela ordem do template.
  fases: { fase: string; tarefas: TarefaInterna[] }[];
  orcamento: Omit<RelatorioCliente['orcamento'], 'categorias'> & {
    categorias: (CategoriaRelatorio & { itens: (LinhaOrcamento & { fornecedor: string })[] })[];
  };
  fornecedores: { nome: string; categoria: string; contactos: string; avaliacao: string; notas: string | null }[];
  convidados: string | null;
  listaConvidados: { nome: string; telemovel: string; resposta: string; acompanhantes: string; mesa: string }[];
}

// Relatório interno (decisão 020): tudo o que a equipa precisa no dia, incluindo notas, responsáveis,
// fornecedores com contactos e a lista de convidados. Só para o dono e os editores.
export function montarRelatorioInterno(
  projecto: Projecto,
  convidados: Convidado[],
  mesas: Mesa[],
  fornecedores: Fornecedor[],
  agora: Date,
): RelatorioInterno {
  const cliente = montarRelatorioCliente(projecto, calcularTotais(convidados), agora);
  const usados = new Set(projecto.orcamento.flatMap((i) => (i.fornecedor ? [i.fornecedor.id] : [])));
  const nomeMesa = new Map(mesas.map((m) => [m.id, m.nome]));
  const fases = [...new Set(projecto.tarefasDoProjecto.map((t) => t.fase))];
  const papeis = mensagens.ecras.projecto.papeisAcesso;
  return {
    ...cliente,
    subtitulo: q.interno.titulo,
    equipa: projecto.membros.map((m) => [m.nome, papeis[m.papel]]),
    fases: fases.map((fase) => ({
      fase,
      tarefas: projecto.tarefasDoProjecto
        .filter((t) => t.fase === fase)
        .map((t) => ({
          titulo: t.titulo,
          prazo: t.inicio === t.fim ? formatarData(t.fim) : `${formatarData(t.inicio)} a ${formatarData(t.fim)}`,
          responsavel: t.responsavel?.nome ?? q.semResponsavel,
          estado: t.emAtraso ? q.emAtraso : mensagens.ecras.projecto.estadoTarefa[t.estado],
          critica: t.critica,
          emAtraso: t.emAtraso,
          nota: t.nota,
        })),
    })),
    orcamento: {
      ...cliente.orcamento,
      categorias: cliente.orcamento.categorias.map((c) => ({
        ...c,
        itens: projecto.orcamento
          .filter((i) => i.categoria === c.categoria)
          .map((i) => ({
            descricao: i.descricao,
            previsto: formatarKz(i.previstoCentimos),
            real: formatarKz(i.realCentimos),
            acima: i.realCentimos > i.previstoCentimos,
            fornecedor: i.fornecedor?.nome ?? '—',
          })),
      })),
    },
    // Só os fornecedores escolhidos nas rubricas deste projecto.
    fornecedores: fornecedores
      .filter((f) => usados.has(f.id))
      .map((f) => ({
        nome: f.nome,
        categoria: f.categoria,
        contactos: [f.telemovel && formatarTelemovel(f.telemovel), f.email].filter(Boolean).join(' · ') || q.semContacto,
        avaliacao: f.media === null ? q.semAvaliacoes : q.media(formatarMedia(f.media), f.avaliacoes),
        notas: f.notas,
      })),
    listaConvidados: convidados.map((c) => ({
      nome: c.nome,
      telemovel: c.telemovel ? formatarTelemovel(c.telemovel) : '—',
      resposta: mensagens.ecras.convidados.respostas[c.resposta],
      acompanhantes: c.resposta === 'yes' ? `${c.acompanhantesConfirmados}/${c.acompanhantes}` : String(c.acompanhantes),
      mesa: (c.mesaId && nomeMesa.get(c.mesaId)) || '—',
    })),
  };
}

export interface SemanaCronograma {
  // "Semana de 12/10/2026 a 18/10/2026" (segunda a domingo).
  titulo: string;
  // A semana do dia do evento.
  doEvento: boolean;
  tarefas: { datas: string; relativo: string; titulo: string; responsavel: string; estado: string; critica: boolean; emAtraso: boolean }[];
}

export interface RelatorioCronograma extends Pick<RelatorioCliente, 'titulo' | 'subtitulo' | 'detalhes' | 'geradoEm' | 'progresso'> {
  semanas: SemanaCronograma[];
}

// Cronograma (decisão 020): as tarefas pela data de início, agrupadas por semana (segunda a domingo), com a
// distância ao dia do evento (D-12, D0, D+3), o responsável e o estado. Sem notas nem valores.
export function montarRelatorioCronograma(projecto: Projecto, agora: Date): RelatorioCronograma {
  const cliente = montarRelatorioCliente(projecto, { convidados: 0, vao: 0, naoVao: 0, semResposta: 0, pessoas: 0 }, agora);
  const ordenadas = [...projecto.tarefasDoProjecto].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
  const semanas = new Map<string, SemanaCronograma>();
  const segundaDoEvento = somarDias(projecto.dataEvento, -diaDaSemana(projecto.dataEvento));
  for (const t of ordenadas) {
    const segunda = somarDias(t.inicio, -diaDaSemana(t.inicio));
    let semana = semanas.get(segunda);
    if (!semana) {
      semana = { titulo: q.semana(formatarData(segunda), formatarData(somarDias(segunda, 6))), doEvento: segunda === segundaDoEvento, tarefas: [] };
      semanas.set(segunda, semana);
    }
    const d = diasEntre(projecto.dataEvento, t.inicio);
    semana.tarefas.push({
      datas: t.inicio === t.fim ? formatarData(t.inicio) : `${formatarData(t.inicio)} a ${formatarData(t.fim)}`,
      relativo: d === 0 ? 'D0' : d < 0 ? `D${d}` : `D+${d}`,
      titulo: t.titulo,
      responsavel: t.responsavel?.nome ?? q.semResponsavel,
      estado: t.emAtraso ? q.emAtraso : mensagens.ecras.projecto.estadoTarefa[t.estado],
      critica: t.critica,
      emAtraso: t.emAtraso,
    });
  }
  return {
    titulo: cliente.titulo,
    subtitulo: q.cronograma.titulo,
    detalhes: cliente.detalhes,
    geradoEm: cliente.geradoEm,
    progresso: cliente.progresso,
    semanas: [...semanas.values()],
  };
}
