import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { converter, lerOffset, PASTA_DADOS, serializar, versaoDe } from '../scripts/converter-templates.js';
import type { Taxonomia, Template } from '../src/shared/templates.js';

const ler = <T>(ficheiro: string): T => JSON.parse(readFileSync(join(PASTA_DADOS, ficheiro), 'utf8'));
const taxonomia = ler<Taxonomia>('taxonomia.json');
const templates = Object.fromEntries(['T01', 'T02', 'T03', 'T04'].map((c) => [c, ler<Template>(`${c}.json`)])) as Record<string, Template>;

describe('conversão do Excel', () => {
  it('os ficheiros de dados estão actualizados com o Excel (correr: npm run templates:converter)', async () => {
    const convertido = await converter();
    // Nem a mais nem a menos: um template que saia do Excel não pode ficar esquecido nos dados.
    const ficheiros = readdirSync(PASTA_DADOS).filter((f) => /^T\d{2}\.json$/.test(f)).sort();
    expect(ficheiros).toEqual(convertido.templates.map((t) => `${t.codigo}.json`).sort());
    expect(serializar(convertido.taxonomia)).toBe(readFileSync(join(PASTA_DADOS, 'taxonomia.json'), 'utf8'));
    for (const t of convertido.templates) {
      expect(serializar(t), `${t.codigo}.json desactualizado`).toBe(readFileSync(join(PASTA_DADOS, `${t.codigo}.json`), 'utf8'));
    }
  });

  it.each([
    ['D-21', -21],
    ['D0', 0],
    ['D+7', 7],
    ['D-365', -365],
    [' D - 3 ', -3],
    ['D\u201321', -21], // traço de autocorrecção do Excel
    ['D-0', 0],
  ])('lê o offset %s', (texto, dias) => {
    expect(lerOffset(texto, 'teste')).toBe(dias);
  });

  it.each(['', 'D', 'D21', '21', 'D-x', 'dia 3'])('recusa offsets inválidos (%s)', (texto) => {
    expect(() => lerOffset(texto, 'teste')).toThrow(/offset inválido/);
  });

  it('D-0 dá 0, não -0', () => {
    expect(Object.is(lerOffset('D-0', 'teste'), 0)).toBe(true);
  });

  it('a versão de um template muda quando o conteúdo muda', () => {
    const t = templates.T01!;
    const { versao, ...resto } = t;
    expect(versaoDe(resto)).toBe(versao);
    const alterado = { ...resto, tarefas: resto.tarefas.map((x, i) => (i === 0 ? { ...x, nota: 'outra' } : x)) };
    expect(versaoDe(alterado)).not.toBe(versao);
  });
});

describe('conteúdo dos templates (CLAUDE.md, secção 9)', () => {
  it.each([
    ['T01', 'Conferência de Imprensa', 47, 20],
    ['T02', 'Casamento', 69, 28],
    ['T03', 'Congresso', 74, 35],
    ['T04', 'Festival / Concerto', 86, 49],
  ])('%s %s: %i tarefas, %i críticas', (codigo, nome, total, criticas) => {
    const t = templates[codigo]!;
    expect(t.nome).toBe(nome);
    expect(t.tarefas).toHaveLength(total);
    expect(t.tarefas.filter((x) => x.critica)).toHaveLength(criticas);
  });

  it.each(['T01', 'T02', 'T03', 'T04'])('%s: IDs únicos e no formato certo; offsets coerentes; campos preenchidos', (codigo) => {
    const t = templates[codigo]!;
    const ids = t.tarefas.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of t.tarefas) {
      expect(x.id).toMatch(new RegExp(`^${codigo}-\\d{3}$`));
      expect(x.fim, `${x.id}: fim antes do início`).toBeGreaterThanOrEqual(x.inicio);
      expect(x.titulo.length, `${x.id}: sem título`).toBeGreaterThan(0);
      expect(taxonomia.fases, `${x.id}: fase`).toContain(x.fase);
      expect(x.papel.length, `${x.id}: sem papel`).toBeGreaterThan(0);
    }
  });

  it('T01 usa apenas categorias, papéis e categorias de orçamento das listas fechadas', () => {
    const t = templates.T01!;
    for (const x of t.tarefas) {
      expect(taxonomia.categoriasTarefa, `${x.id}: categoria`).toContain(x.categoria);
      expect(taxonomia.papeis, `${x.id}: papel`).toContain(x.papel);
    }
    for (const r of t.rubricas) expect(taxonomia.categoriasOrcamento, r.descricao).toContain(r.categoria);
  });

  // Diferenças conhecidas entre o Excel e as listas fechadas, à espera de decisão do Adriano antes de
  // estes templates serem lançados (docs/decisoes/011-templates.md). Uma diferença nova faz o teste falhar.
  it.each([
    ['T02', ['Alojamento', 'Artístico', 'Produção', 'Segurança', 'Transporte'], [], ['Legal']],
    ['T03', ['Alojamento', 'Produção', 'Segurança', 'Transporte'], ['Legal'], []],
    ['T04', ['Alojamento', 'Artístico', 'Produção', 'Segurança', 'Transporte'], ['Legal', 'Segurança'], ['Legal']],
  ])('%s: só as diferenças conhecidas às listas fechadas', (codigo, categorias, papeis, orcamento) => {
    const t = templates[codigo]!;
    const fora = (valores: string[], lista: string[]) => [...new Set(valores.filter((v) => !lista.includes(v)))].sort();
    expect(fora(t.tarefas.map((x) => x.categoria), taxonomia.categoriasTarefa)).toEqual(categorias);
    expect(fora(t.tarefas.map((x) => x.papel), taxonomia.papeis)).toEqual(papeis);
    expect(fora(t.rubricas.map((r) => r.categoria), taxonomia.categoriasOrcamento)).toEqual(orcamento);
  });

  it.each([
    ['T01', 10, 'Contingência (10%)'],
    ['T02', 26, 'Contingência (15%)'],
    ['T03', 16, 'Contingência (10%)'],
    ['T04', 30, 'Contingência (15%)'],
  ])('%s: %i rubricas de orçamento pré-carregadas, incluindo %s', (codigo, total, contingencia) => {
    const t = templates[codigo]!;
    expect(t.rubricas).toHaveLength(total);
    expect(t.rubricas).toContainEqual(expect.objectContaining({ categoria: 'Outros', descricao: contingencia, obrigatoria: true }));
  });

  it('a categoria de orçamento é "Equipa de trabalho", nunca "Equipe"', () => {
    expect(taxonomia.categoriasOrcamento).toContain('Equipa de trabalho');
    expect(JSON.stringify(Object.values(templates))).not.toMatch(/Equipe\b/);
  });

  it('as notas estão presentes onde o Excel as tem (a coluna mais importante)', () => {
    const nota = templates.T01!.tarefas.find((x) => x.id === 'T01-022')!.nota;
    expect(nota).toContain('Em Luanda, o e-mail não garante presença');
    expect(templates.T01!.tarefas.filter((x) => x.nota).length).toBe(34);
  });
});

// Excel mínimo para testar o conversor com dados problemáticos.
async function excelDeTeste(tarefas: unknown[][], rubricas: unknown[][] = [['T09', 'Local', 'Sala', 'Sim', '']]) {
  const livro = new ExcelJS.Workbook();
  const tax = livro.addWorksheet('Taxonomia');
  tax.addRows([
    ['Taxonomia'], [], ['FASES'], ['Fase', 'Descrição'], ['Pré Produção', 'x'], ['Produção', 'x'], ['Pós Produção', 'x'],
    [], ['CATEGORIAS DE TAREFA'], ['Categoria', 'Âmbito'], ['Estratégia', 'x'], ['Nova sem descrição'],
    [], ['PAPÉIS'], ['Papel', 'Nota'], ['Gestor', 'x'],
    [], ['CATEGORIAS DE ORÇAMENTO'], ['Categoria', 'Nota'], ['Local', 'x'],
  ]);
  const orc = livro.addWorksheet('Orçamento_Modelos');
  orc.addRows([['Rubricas'], [], [], ['Template', 'Categoria', 'Descrição', 'Obrigatória', 'Nota'], ...rubricas]);
  const t = livro.addWorksheet('T09_Teste');
  t.addRows([['T09 — Teste'], ['Comprador: teste'], [], ['ID', 'Fase', 'Categoria', 'Título', 'Papel', 'Início', 'Fim', 'Crítica', 'Nota'], ...tarefas]);
  const caminho = join(mkdtempSync(join(tmpdir(), 'eveni-xlsx-')), 'teste.xlsx');
  await livro.xlsx.writeFile(caminho);
  return caminho;
}

const tarefaBoa = ['T09-001', 'Pré Produção', 'Estratégia', 'Fazer algo', 'Gestor', 'D-10', '', 'Sim', 'Nota'];

describe('o conversor recusa erros no Excel em vez de os passar para o produto', () => {
  it('aceita um Excel correcto e conta itens da taxonomia mesmo sem descrição', async () => {
    const r = await converter(await excelDeTeste([tarefaBoa]));
    expect(r.templates[0]!.tarefas[0]).toMatchObject({ id: 'T09-001', inicio: -10, fim: -10, critica: true });
    expect(r.taxonomia.categoriasTarefa).toContain('Nova sem descrição');
    expect(r.avisos).toEqual([]);
  });

  it.each(['S', 'Sím', 'Yes', 'x'])('Crítica = "%s" é um erro (só "Sim" ou vazio)', async (valor) => {
    const tarefa = [...tarefaBoa];
    tarefa[7] = valor;
    await expect(converter(await excelDeTeste([tarefa]))).rejects.toThrow(/Crítica.*inválido/);
  });

  it('Obrigatória mal escrita numa rubrica é um erro', async () => {
    await expect(converter(await excelDeTeste([tarefaBoa], [['T09', 'Local', 'Sala', 'Obrig.', '']]))).rejects.toThrow(/Obrigatória.*inválido/);
  });

  it('ID repetido é um erro', async () => {
    await expect(converter(await excelDeTeste([tarefaBoa, tarefaBoa]))).rejects.toThrow(/ID repetido/);
  });

  it('Fim antes do Início é um erro', async () => {
    const tarefa = [...tarefaBoa];
    tarefa[6] = 'D-20';
    await expect(converter(await excelDeTeste([tarefa]))).rejects.toThrow(/Fim antes do Início/);
  });

  it('fase fora da lista é um erro', async () => {
    const tarefa = [...tarefaBoa];
    tarefa[1] = 'Pré-produção';
    await expect(converter(await excelDeTeste([tarefa]))).rejects.toThrow(/fase/);
  });

  it('uma célula com erro de fórmula (#REF!) é um erro, não texto "[object Object]"', async () => {
    const tarefa: unknown[] = [...tarefaBoa];
    tarefa[8] = { error: '#REF!' };
    await expect(converter(await excelDeTeste([tarefa]))).rejects.toThrow(/erro na célula/);
  });

  it('categoria ou papel fora da lista dá aviso (há templates com diferenças à espera de decisão)', async () => {
    const tarefa = [...tarefaBoa];
    tarefa[2] = 'Alojamento';
    const r = await converter(await excelDeTeste([tarefa]));
    expect(r.avisos).toEqual(['T09-001: categoria "Alojamento" fora da lista']);
  });
});
