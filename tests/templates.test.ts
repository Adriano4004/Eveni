import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { converter, derivar, encolherOffset, lerOffset, PASTA_DADOS, serializar, versaoDe } from '../scripts/converter-templates.js';
import { DERIVADOS } from '../scripts/templates-derivados.js';
import { separarContingencia } from '../src/shared/orcamento.js';
import type { Taxonomia, Template } from '../src/shared/templates.js';

const ler = <T>(ficheiro: string): T => JSON.parse(readFileSync(join(PASTA_DADOS, ficheiro), 'utf8'));
const taxonomia = ler<Taxonomia>('taxonomia.json');
const templates = Object.fromEntries(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07'].map((c) => [c, ler<Template>(`${c}.json`)])) as Record<string, Template>;

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
    ['T05', 'Fórum', 62, 30],
    ['T06', 'Conferência', 70, 35],
    ['T07', 'Aniversário', 47, 21],
  ])('%s %s: %i tarefas, %i críticas', (codigo, nome, total, criticas) => {
    const t = templates[codigo]!;
    expect(t.nome).toBe(nome);
    expect(t.tarefas).toHaveLength(total);
    expect(t.tarefas.filter((x) => x.critica)).toHaveLength(criticas);
  });

  it.each(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07'])('%s: IDs únicos e no formato certo; offsets coerentes; campos preenchidos', (codigo) => {
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

  it.each(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07'])('%s usa apenas categorias, papéis e categorias de orçamento das listas fechadas', (codigo) => {
    const t = templates[codigo]!;
    for (const x of t.tarefas) {
      expect(taxonomia.categoriasTarefa, `${x.id}: categoria`).toContain(x.categoria);
      expect(taxonomia.papeis, `${x.id}: papel`).toContain(x.papel);
    }
    for (const r of t.rubricas) expect(taxonomia.categoriasOrcamento, r.descricao).toContain(r.categoria);
  });

  it('as listas incluem os valores aprovados pelo Adriano (decisão 011)', () => {
    expect(taxonomia.categoriasTarefa).toEqual(expect.arrayContaining(['Alojamento', 'Artístico', 'Produção', 'Segurança', 'Transporte']));
    expect(taxonomia.papeis).toEqual(expect.arrayContaining(['Registo', 'Legal', 'Segurança']));
    expect(taxonomia.categoriasOrcamento).toContain('Legal');
    for (const lista of Object.values(taxonomia)) expect(new Set(lista).size).toBe(lista.length);
  });

  it.each([
    ['T01', 10, 'Contingência (10%)'],
    ['T02', 26, 'Contingência (15%)'],
    ['T03', 16, 'Contingência (10%)'],
    ['T04', 30, 'Contingência (15%)'],
    ['T05', 13, 'Contingência (10%)'],
    ['T06', 16, 'Contingência (10%)'],
    ['T07', 17, 'Contingência (10%)'],
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

describe('Fórum e Conferência, derivados do T03 (decisão 022)', () => {
  const T03 = templates.T03!;
  const origemDe = (id: string) => T03.tarefas.find((x) => x.id === `T03-${id.slice(4)}`)!;

  it.each([
    ['T05', 90, ['004', '008', '017', '021', '022', '024', '025', '030', '031', '033', '047', '067']],
    ['T06', 120, ['004', '017', '030', '033']],
  ])('%s: começa a D-%i e tem todas as tarefas do T03 menos as aprovadas para sair', (codigo, horizonte, saem) => {
    const t = templates[codigo]!;
    expect(Math.min(...t.tarefas.map((x) => x.inicio))).toBe(-horizonte);
    const esperados = T03.tarefas.map((x) => x.id.slice(4)).filter((n) => !saem.includes(n));
    expect(t.tarefas.map((x) => x.id)).toEqual(esperados.map((n) => `${codigo}-${n}`));
  });

  it.each(['T05', 'T06'])('%s: notas, fases, categorias, papéis e críticas iguais às do T03', (codigo) => {
    for (const x of templates[codigo]!.tarefas) {
      const o = origemDe(x.id);
      expect({ ...x, id: o.id, titulo: o.titulo, inicio: o.inicio, fim: o.fim }, x.id).toEqual(o);
    }
  });

  it.each(['T05', 'T06'])('%s: o último mês e o pós-evento ficam com os prazos do T03; antes disso, só encolhem', (codigo) => {
    for (const x of templates[codigo]!.tarefas) {
      const o = origemDe(x.id);
      for (const [novo, antigo] of [[x.inicio, o.inicio], [x.fim, o.fim]] as const) {
        if (antigo >= -30) expect(novo, x.id).toBe(antigo);
        else expect(novo, x.id).toBeGreaterThanOrEqual(antigo);
      }
      expect(x.fim, x.id).toBeGreaterThanOrEqual(x.inicio);
    }
  });

  it('a ordem das tarefas no tempo mantém-se', () => {
    for (const codigo of ['T05', 'T06']) {
      const t = templates[codigo]!.tarefas.filter((x) => x.id !== 'T06-024');
      for (let i = 1; i < t.length; i++) {
        if (origemDe(t[i]!.id).inicio >= origemDe(t[i - 1]!.id).inicio) expect(t[i]!.inicio, t[i]!.id).toBeGreaterThanOrEqual(t[i - 1]!.inicio);
      }
    }
  });

  it('na Conferência, os vistos continuam a começar 90 dias antes, como pede a nota', () => {
    const vistos = templates.T06!.tarefas.find((x) => x.id === 'T06-024')!;
    expect(vistos).toMatchObject({ inicio: -90, fim: -45, critica: true });
    expect(vistos.nota).toContain('Começar 90 dias antes');
  });

  it('o Fórum não tem as rubricas de tradução, viagens e alojamento de oradores', () => {
    const descricoes = templates.T05!.rubricas.map((r) => r.descricao);
    for (const d of ['Tradução simultânea', 'Viagens de oradores', 'Alojamento de oradores']) expect(descricoes).not.toContain(d);
    expect(templates.T06!.rubricas).toHaveLength(T03.rubricas.length);
  });

  it.each(['T05', 'T06'])('%s não fala em "congresso"', (codigo) => {
    const { descricao, tarefas, rubricas } = templates[codigo]!;
    expect(JSON.stringify({ descricao, tarefas, rubricas })).not.toMatch(/congress/i);
    expect(tarefas.find((x) => x.id === `${codigo}-018`)!.titulo).toBe('Criar site ou página do evento');
    expect(rubricas.map((r) => r.descricao)).toContain('Site do evento');
  });

  it('a descrição da Conferência não se confunde com a Conferência de Imprensa', () => {
    expect(templates.T06!.descricao).toMatch(/palestras/);
    expect(templates.T06!.descricao).not.toMatch(/Conferência de Imprensa/);
  });

  it('encolher: igual a partir de D-30, proporcional antes, o primeiro dia da origem vai para o horizonte', () => {
    expect(encolherOffset(-30, 180, 90)).toBe(-30);
    expect(encolherOffset(-5, 180, 90)).toBe(-5);
    expect(encolherOffset(30, 180, 90)).toBe(30);
    expect(encolherOffset(-180, 180, 90)).toBe(-90);
    expect(encolherOffset(-105, 180, 90)).toBe(-60);
    expect(encolherOffset(-180, 180, 120)).toBe(-120);
  });

  it('uma definição que aponta para o que não existe na origem pára a conversão', () => {
    const base = DERIVADOS[0]!;
    expect(() => derivar({ ...base, saem: ['T03-999'] }, T03)).toThrow(/T03-999 não existe/);
    expect(() => derivar({ ...base, mantemPrazos: ['T03-999'] }, T03)).toThrow(/T03-999 não existe/);
    expect(() => derivar({ ...base, rubricasQueSaem: ['Fogo de artifício'] }, T03)).toThrow(/rubrica "Fogo de artifício"/);
    expect(() => derivar({ ...base, horizonte: 365 }, T03)).toThrow(/horizonte/);
    expect(() => derivar({ ...base, mantemPrazos: ['T03-004'] }, T03)).toThrow(/sai e mantém/);
    // Manter os prazos de uma tarefa mais antiga do que o horizonte também é um erro.
    expect(() => derivar({ ...base, saem: [], mantemPrazos: ['T03-001'] }, T03)).toThrow(/antes do horizonte/);
  });

  it('um derivado com o código de um template do Excel pára a conversão', async () => {
    await expect(converter(undefined, [{ ...DERIVADOS[0]!, codigo: 'T01' }])).rejects.toThrow(/já existe/);
    await expect(converter(undefined, [{ ...DERIVADOS[0]!, origem: 'T09' }])).rejects.toThrow(/T09 em falta/);
  });
});

describe('Aniversário, derivado do T02 (decisão 025)', () => {
  const T02 = templates.T02!;
  const T07 = templates.T07!;
  const origemDe = (id: string) => T02.tarefas.find((x) => x.id === `T02-${id.slice(4)}`)!;
  const saem = ['004', '005', '007', '009', '010', '011', '012', '014', '015', '016', '017', '027', '031', '032', '035', '036', '042', '043', '050', '051', '057', '066'];
  const notasReescritas = ['008', '021', '029', '037', '060', '068', '069'];

  it('começa a D-120 e tem todas as tarefas do T02 menos as aprovadas para sair', () => {
    expect(Math.min(...T07.tarefas.map((x) => x.inicio))).toBe(-120);
    expect(T07.tarefas.map((x) => x.id)).toEqual(T02.tarefas.map((x) => x.id.slice(4)).filter((n) => !saem.includes(n)).map((n) => `T07-${n}`));
  });

  it('fases, categorias, papéis e críticas iguais às do T02; notas iguais, excepto as sete reescritas', () => {
    for (const x of T07.tarefas) {
      const o = origemDe(x.id);
      expect({ ...x, id: o.id, titulo: o.titulo, inicio: o.inicio, fim: o.fim, nota: o.nota }, x.id).toEqual(o);
      if (notasReescritas.includes(x.id.slice(4))) expect(x.nota, x.id).not.toBe(o.nota);
      else expect(x.nota, x.id).toBe(o.nota);
    }
  });

  it('o último mês e o pós-evento ficam com os prazos do T02; os convites passam a D-46', () => {
    for (const x of T07.tarefas) {
      const o = origemDe(x.id);
      if (o.inicio >= -30) expect(x.inicio, x.id).toBe(o.inicio);
      if (o.fim >= -30) expect(x.fim, x.id).toBe(o.fim);
    }
    expect(T07.tarefas.find((x) => x.id === 'T07-029')).toMatchObject({ titulo: 'Enviar convites', inicio: -46, critica: true, nota: expect.stringMatching(/^Seis semanas antes/) });
  });

  it('não fala em noivos, casamento, copo-de-água, véu, alembamento nem lobolo', () => {
    const { nome, descricao, tarefas, rubricas } = T07;
    expect(JSON.stringify({ nome, descricao, tarefas, rubricas })).not.toMatch(/noiv|casament|casais|copo-de-água|matrimon|alembam|lobolo|wedding|registo civil|véu/i);
  });

  it('orçamento: sem as rubricas do casamento, espaço da festa e contingência de 10%', () => {
    const descricoes = T07.rubricas.map((r) => r.descricao);
    for (const d of ['Lobolo', 'Alembamento', 'Vestido da noiva', 'Alianças', 'Taxas de registo civil', 'Espaço da cerimónia']) expect(descricoes).not.toContain(d);
    expect(descricoes).toContain('Espaço da festa');
    expect(separarContingencia(T07.rubricas).percentagem).toBe(10);
    expect(separarContingencia(T02.rubricas).percentagem).toBe(15);
    // A nota da contingência do casamento (quinze por cento, doze meses) não passa para o aniversário.
    expect(T07.rubricas.find((r) => r.descricao === 'Contingência (10%)')!.nota).toBeNull();
    expect(JSON.stringify(T07.rubricas)).not.toMatch(/quinze|doze meses/i);
  });

  it('uma nota reescrita para uma tarefa que não existe na origem pára a conversão', () => {
    const def = DERIVADOS.find((d) => d.codigo === 'T07')!;
    expect(() => derivar({ ...def, notas: { 'T02-999': 'x' } }, T02)).toThrow(/T02-999 não existe/);
    expect(() => derivar({ ...def, notasRubricas: { 'Fogo de artifício': null } }, T02)).toThrow(/rubrica "Fogo de artifício"/);
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

// Sem derivados: o Excel de teste não tem o T03.
const converterTeste = (caminho: string) => converter(caminho, []);

const tarefaBoa = ['T09-001', 'Pré Produção', 'Estratégia', 'Fazer algo', 'Gestor', 'D-10', '', 'Sim', 'Nota'];

describe('o conversor recusa erros no Excel em vez de os passar para o produto', () => {
  it('aceita um Excel correcto e conta itens da taxonomia mesmo sem descrição', async () => {
    const r = await converterTeste(await excelDeTeste([tarefaBoa]));
    expect(r.templates[0]!.tarefas[0]).toMatchObject({ id: 'T09-001', inicio: -10, fim: -10, critica: true });
    expect(r.taxonomia.categoriasTarefa).toContain('Nova sem descrição');
  });

  it.each(['S', 'Sím', 'Yes', 'x'])('Crítica = "%s" é um erro (só "Sim" ou vazio)', async (valor) => {
    const tarefa = [...tarefaBoa];
    tarefa[7] = valor;
    await expect(converterTeste(await excelDeTeste([tarefa]))).rejects.toThrow(/Crítica.*inválido/);
  });

  it('Obrigatória mal escrita numa rubrica é um erro', async () => {
    await expect(converterTeste(await excelDeTeste([tarefaBoa], [['T09', 'Local', 'Sala', 'Obrig.', '']]))).rejects.toThrow(/Obrigatória.*inválido/);
  });

  it('ID repetido é um erro', async () => {
    await expect(converterTeste(await excelDeTeste([tarefaBoa, tarefaBoa]))).rejects.toThrow(/ID repetido/);
  });

  it('Fim antes do Início é um erro', async () => {
    const tarefa = [...tarefaBoa];
    tarefa[6] = 'D-20';
    await expect(converterTeste(await excelDeTeste([tarefa]))).rejects.toThrow(/Fim antes do Início/);
  });

  it('fase fora da lista é um erro', async () => {
    const tarefa = [...tarefaBoa];
    tarefa[1] = 'Pré-produção';
    await expect(converterTeste(await excelDeTeste([tarefa]))).rejects.toThrow(/fase/);
  });

  it('uma célula com erro de fórmula (#REF!) é um erro, não texto "[object Object]"', async () => {
    const tarefa: unknown[] = [...tarefaBoa];
    tarefa[8] = { error: '#REF!' };
    await expect(converterTeste(await excelDeTeste([tarefa]))).rejects.toThrow(/erro na célula/);
  });

  it('categoria ou papel fora da lista é um erro', async () => {
    const categoria = [...tarefaBoa];
    categoria[2] = 'Catering';
    await expect(converterTeste(await excelDeTeste([categoria]))).rejects.toThrow('T09-001: categoria "Catering" fora da lista');
    const papel = [...tarefaBoa];
    papel[4] = 'Estagiário';
    await expect(converterTeste(await excelDeTeste([papel]))).rejects.toThrow('T09-001: papel "Estagiário" fora da lista');
  });
});
