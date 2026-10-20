// Converte o Excel dos templates (docs/templates/Eveni-Templates-Projecto.xlsx) em ficheiros de dados
// versionados (data/templates/*.json). Para escrever os ficheiros, depois de cada alteração ao Excel:
//
//   npm run templates:converter      (scripts/converter-templates-cli.ts)
//
// Os testes (tests/templates.test.ts) voltam a converter o Excel e falham se os JSON não estiverem
// actualizados, e validam o conteúdo (totais, IDs, offsets, listas fechadas).
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { RubricaTemplate, Taxonomia, TarefaTemplate, Template } from '../src/shared/templates.js';

export const CAMINHO_EXCEL = 'docs/templates/Eveni-Templates-Projecto.xlsx';
export const PASTA_DADOS = 'data/templates';

// Ajustes à taxonomia do Excel, decididos fora dele (registar aqui o porquê de cada um).
const PAPEIS_EXTRA = [
  // O T01 atribui 6 tarefas ao papel "Registo" (presenças, clipping, relatórios), que não está na
  // folha Taxonomia. Opção recomendada, A CONFIRMAR pelo Adriano (docs/decisoes/011-templates.md).
  'Registo',
];

type Celula = ExcelJS.CellValue;

// Texto de uma célula, seja texto simples, texto formatado ou fórmula.
// Valores inesperados (erros de fórmula como #REF!, datas) param a conversão: nunca chegam ao produto.
function texto(valor: Celula, onde: string): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) throw new Error(`${onde}: data onde se esperava texto`);
  if (typeof valor === 'object') {
    if ('error' in valor) throw new Error(`${onde}: erro na célula (${String(valor.error)})`);
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('').trim();
    if ('formula' in valor || 'sharedFormula' in valor) return texto((valor as { result?: Celula }).result ?? null, onde);
    if ('text' in valor) return String(valor.text).trim();
    throw new Error(`${onde}: valor de célula não suportado`);
  }
  return String(valor).trim();
}

// "Sim" ou vazio; qualquer outra coisa (ex.: "S", "Sím", "Yes") é um erro a corrigir no Excel.
function simOuVazio(valor: string, onde: string): boolean {
  if (valor === '') return false;
  if (valor.toLowerCase() === 'sim') return true;
  throw new Error(`${onde}: valor "${valor}" inválido (escrever "Sim" ou deixar vazio)`);
}

// "D-21" -> -21, "D0" -> 0, "D+7" -> 7
export function lerOffset(valor: string, contexto: string): number {
  // O Excel troca às vezes o hífen por outros traços (autocorrecção): aceitam-se todos como "menos".
  const limpo = valor.replace(/\s/g, '').replace(/[\u2010-\u2015\u2212]/g, '-');
  const m = /^D(0|[+-]\d+)$/.exec(limpo);
  if (!m) throw new Error(`${contexto}: offset inválido "${valor}" (esperado D-n, D0 ou D+n)`);
  return Number(m[1]) + 0; // "+ 0" transforma -0 em 0
}

function linhas(ws: ExcelJS.Worksheet): string[][] {
  const resultado: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const valores = ws.getRow(r).values as Celula[];
    resultado.push(valores.slice(1).map((v, c) => texto(v, `${ws.name}, linha ${r}, coluna ${c + 1}`)));
  }
  return resultado;
}

const SECCOES_TAXONOMIA = ['FASES', 'CATEGORIAS DE TAREFA', 'PAPÉIS', 'CATEGORIAS DE ORÇAMENTO'];
const CABECALHOS_TAXONOMIA = ['Fase', 'Categoria', 'Papel'];

// Cada secção começa no seu título e vai até ao título seguinte. Conta qualquer linha com a primeira
// coluna preenchida, tenha ou não descrição.
function lerTaxonomia(ws: ExcelJS.Worksheet): Taxonomia {
  const seccoes: Record<string, string[]> = {};
  let actual: string | null = null;
  for (const [primeira = ''] of linhas(ws)) {
    if (SECCOES_TAXONOMIA.includes(primeira)) {
      actual = primeira;
      seccoes[actual] = [];
    } else if (actual && primeira && !CABECALHOS_TAXONOMIA.includes(primeira)) {
      seccoes[actual]!.push(primeira);
    }
  }
  const obter = (nome: string) => {
    const lista = seccoes[nome];
    if (!lista?.length) throw new Error(`Taxonomia: secção "${nome}" em falta`);
    return lista;
  };
  return {
    fases: obter('FASES'),
    categoriasTarefa: obter('CATEGORIAS DE TAREFA'),
    papeis: [...obter('PAPÉIS'), ...PAPEIS_EXTRA],
    categoriasOrcamento: obter('CATEGORIAS DE ORÇAMENTO'),
  };
}

function lerTemplate(ws: ExcelJS.Worksheet): Omit<Template, 'versao' | 'rubricas'> {
  const todas = linhas(ws);
  const titulo = todas[0]?.[0] ?? '';
  const m = /^(T\d{2})\s*—\s*(.+)$/.exec(titulo);
  if (!m) throw new Error(`${ws.name}: título "${titulo}" não segue "Txx — Nome"`);
  const [, codigo, nome] = m as unknown as [string, string, string];
  const cabecalho = todas.findIndex((l) => l[0] === 'ID');
  if (cabecalho < 0) throw new Error(`${ws.name}: linha de cabeçalho (ID, Fase, …) em falta`);

  const tarefas: TarefaTemplate[] = [];
  for (const [id = '', fase = '', categoria = '', tituloTarefa = '', papel = '', inicio = '', fim = '', critica = '', nota = ''] of todas.slice(
    cabecalho + 1,
  )) {
    // As linhas de totais no fim da folha ("Total de tarefas", "Críticas") não têm ID: não são tarefas.
    if (!id) continue;
    const contexto = `${ws.name} ${id}`;
    if (!new RegExp(`^${codigo}-\\d{3}$`).test(id)) throw new Error(`${contexto}: ID fora do formato ${codigo}-nnn`);
    const offsetInicio = lerOffset(inicio, `${contexto} (Início)`);
    tarefas.push({
      id,
      fase,
      categoria,
      titulo: tituloTarefa,
      papel,
      inicio: offsetInicio,
      fim: fim ? lerOffset(fim, `${contexto} (Fim)`) : offsetInicio,
      critica: simOuVazio(critica, `${contexto} (Crítica)`),
      nota: nota || null,
    });
  }
  return { codigo, nome, descricao: todas[1]?.[0] ?? '', tarefas };
}

// Erros que impedem a conversão. As diferenças às listas fechadas de categorias e papéis são devolvidas
// à parte (avisos), porque há templates com diferenças conhecidas à espera de decisão.
function validarTemplate(t: Omit<Template, 'versao'>, taxonomia: Taxonomia): string[] {
  const avisos: string[] = [];
  const vistos = new Set<string>();
  for (const x of t.tarefas) {
    if (vistos.has(x.id)) throw new Error(`${t.codigo}: ID repetido ${x.id}`);
    vistos.add(x.id);
    if (x.fim < x.inicio) throw new Error(`${x.id}: Fim antes do Início`);
    if (!x.titulo) throw new Error(`${x.id}: sem título`);
    if (!taxonomia.fases.includes(x.fase)) throw new Error(`${x.id}: fase "${x.fase}" fora da lista`);
    if (!taxonomia.categoriasTarefa.includes(x.categoria)) avisos.push(`${x.id}: categoria "${x.categoria}" fora da lista`);
    if (!taxonomia.papeis.includes(x.papel)) avisos.push(`${x.id}: papel "${x.papel}" fora da lista`);
  }
  for (const r of t.rubricas) {
    if (!taxonomia.categoriasOrcamento.includes(r.categoria)) avisos.push(`${t.codigo}: rubrica "${r.descricao}" com categoria "${r.categoria}" fora da lista`);
  }
  return avisos;
}

function lerRubricas(ws: ExcelJS.Worksheet): Map<string, RubricaTemplate[]> {
  const todas = linhas(ws);
  const cabecalho = todas.findIndex((l) => l[0] === 'Template');
  if (cabecalho < 0) throw new Error(`${ws.name}: linha de cabeçalho (Template, Categoria, …) em falta`);
  const porTemplate = new Map<string, RubricaTemplate[]>();
  for (const [codigo = '', categoria = '', descricao = '', obrigatoria = '', nota = ''] of todas.slice(cabecalho + 1)) {
    if (!/^T\d{2}$/.test(codigo)) continue;
    const lista = porTemplate.get(codigo) ?? [];
    lista.push({ categoria, descricao, obrigatoria: simOuVazio(obrigatoria, `${ws.name} ${codigo} "${descricao}" (Obrigatória)`), nota: nota || null });
    porTemplate.set(codigo, lista);
  }
  return porTemplate;
}

export function versaoDe(t: Omit<Template, 'versao'>): string {
  return createHash('sha256').update(JSON.stringify(t)).digest('hex').slice(0, 12);
}

export async function converter(caminho = CAMINHO_EXCEL): Promise<{ taxonomia: Taxonomia; templates: Template[]; avisos: string[] }> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(caminho);
  const folha = (nome: string) => {
    const ws = livro.getWorksheet(nome);
    if (!ws) throw new Error(`Folha "${nome}" em falta no Excel`);
    return ws;
  };
  const taxonomia = lerTaxonomia(folha('Taxonomia'));
  const rubricas = lerRubricas(folha('Orçamento_Modelos'));
  const avisos: string[] = [];
  const templates = livro.worksheets
    .filter((ws) => /^T\d{2}_/.test(ws.name))
    .map((ws) => {
      const base = lerTemplate(ws);
      const semVersao = { ...base, rubricas: rubricas.get(base.codigo) ?? [] };
      avisos.push(...validarTemplate(semVersao, taxonomia));
      return { ...semVersao, versao: versaoDe(semVersao) };
    });
  return { taxonomia, templates, avisos };
}

export function serializar(dados: unknown): string {
  return `${JSON.stringify(dados, null, 2)}\n`;
}
