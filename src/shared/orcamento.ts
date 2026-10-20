// Orçamento de um projecto (decisão 019): categorias, leitura de valores em Kwanza, contingência e totais.
// Partilhado entre o servidor e os ecrãs. Valores sempre em cêntimos (inteiros).
import type { ItemOrcamento } from './projectos.js';

// Lista fechada (CLAUDE.md, secção 9). Um teste confirma que é igual à folha Taxonomia do Excel.
export const CATEGORIAS_ORCAMENTO = [
  'Local',
  'Divulgação',
  'Decoração/Iluminação',
  'Equipamentos',
  'Alimentação/Hospedagem',
  'Equipa de trabalho',
  'Artístico',
  'Segurança',
  'Transporte',
  'Outros',
  'Legal',
] as const;
export type CategoriaOrcamento = (typeof CATEGORIAS_ORCAMENTO)[number];

export const CONTINGENCIA_POR_OMISSAO = 10;
export const MAX_CONTINGENCIA = 50;
export const MAX_RUBRICAS_POR_PROJECTO = 300;
// 100 mil milhões de Kz: muito acima de qualquer evento, e longe do limite dos números exactos.
export const MAX_CENTIMOS = 10_000_000_000_000;

// A rubrica "Contingência (N%)" dos templates não é uma rubrica a preencher: passa a ser a percentagem do
// projecto, calculada sozinha sobre o total previsto (decisão 019). Devolve as outras rubricas e a percentagem.
export function separarContingencia<T extends { descricao: string }>(rubricas: T[]): { rubricas: T[]; percentagem: number } {
  let percentagem = CONTINGENCIA_POR_OMISSAO;
  const outras = rubricas.filter((r) => {
    const contingencia = /^Conting[êe]ncia\s*\((\d{1,2})\s*%\)$/i.exec(r.descricao.trim());
    if (contingencia) percentagem = Number(contingencia[1]);
    return !contingencia;
  });
  return { rubricas: outras, percentagem };
}

// Lê um valor escrito em Kwanza e devolve cêntimos, ou null se não for um valor válido.
// Aceita "5 000 000,00", "5000000", "5.000.000", "1 500,5", "250 000 Kz". Vírgula = decimal; pontos e espaços
// separam milhares. Sem vírgula, um ponto seguido de 1 ou 2 algarismos no fim também conta como decimal ("1500.50").
export function lerKz(texto: string): number | null {
  let t = texto
    .trim()
    .replace(/kz$/i, '')
    .replace(/[\s  ]/g, '');
  if (t === '') return null;
  if (!t.includes(',') && /\.\d{1,2}$/.test(t)) {
    const i = t.lastIndexOf('.');
    t = `${t.slice(0, i).replaceAll('.', '')},${t.slice(i + 1)}`;
  }
  const partes = /^(\d{1,3}(?:\.?\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(t);
  if (!partes) return null;
  const inteiros = Number(partes[1]!.replaceAll('.', ''));
  const centimos = inteiros * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(centimos) && centimos <= MAX_CENTIMOS ? centimos : null;
}

// Para preencher um campo: "5 000 000,00" sem "Kz" e com espaços normais (fáceis de editar).
export function kzParaCampo(centimos: number): string {
  const inteiros = String(Math.floor(centimos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${inteiros},${String(centimos % 100).padStart(2, '0')}`;
}

export interface TotalCategoria {
  categoria: string;
  previsto: number;
  real: number;
  // real - previsto: positivo = gastou mais do que o previsto.
  variacao: number;
}

// ok: real dentro do previsto; contingencia: passou do previsto mas cabe na contingência; excedido: passou de tudo.
export type EstadoOrcamento = 'ok' | 'contingencia' | 'excedido';

export interface ResumoOrcamento {
  categorias: TotalCategoria[];
  subtotalPrevisto: number;
  contingencia: number;
  // Subtotal mais contingência.
  totalPrevisto: number;
  totalReal: number;
  // totalReal - subtotalPrevisto (a contingência serve para cobrir esta diferença).
  variacao: number;
  estado: EstadoOrcamento;
  // Rubricas com o real acima do previsto.
  rubricasExcedidas: number;
}

export function resumirOrcamento(itens: Pick<ItemOrcamento, 'categoria' | 'previstoCentimos' | 'realCentimos'>[], percentagem: number): ResumoOrcamento {
  const porCategoria = new Map<string, TotalCategoria>();
  for (const i of itens) {
    const c = porCategoria.get(i.categoria) ?? { categoria: i.categoria, previsto: 0, real: 0, variacao: 0 };
    c.previsto += i.previstoCentimos;
    c.real += i.realCentimos;
    c.variacao = c.real - c.previsto;
    porCategoria.set(i.categoria, c);
  }
  const ordem = (c: string) => {
    const n = CATEGORIAS_ORCAMENTO.indexOf(c as CategoriaOrcamento);
    return n < 0 ? CATEGORIAS_ORCAMENTO.length : n;
  };
  const categorias = [...porCategoria.values()].sort((a, b) => ordem(a.categoria) - ordem(b.categoria));
  const subtotalPrevisto = categorias.reduce((s, c) => s + c.previsto, 0);
  const totalReal = categorias.reduce((s, c) => s + c.real, 0);
  // Arredondado ao cêntimo.
  const contingencia = Math.round((subtotalPrevisto * percentagem) / 100);
  const totalPrevisto = subtotalPrevisto + contingencia;
  return {
    categorias,
    subtotalPrevisto,
    contingencia,
    totalPrevisto,
    totalReal,
    variacao: totalReal - subtotalPrevisto,
    estado: totalReal > totalPrevisto ? 'excedido' : totalReal > subtotalPrevisto ? 'contingencia' : 'ok',
    rubricasExcedidas: itens.filter((i) => i.realCentimos > i.previstoCentimos).length,
  };
}
