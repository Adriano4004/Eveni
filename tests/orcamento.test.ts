// Orçamento: valores, totais, contingência e quem pode alterar (decisão 019).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { dadosRubrica } from '../src/shared/esquemas.js';
import { CATEGORIAS_ORCAMENTO, kzParaCampo, lerKz, resumirOrcamento, separarContingencia } from '../src/shared/orcamento.js';
import type { ItemOrcamento } from '../src/shared/projectos.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

describe('valores em Kwanza', () => {
  it.each([
    ['5 000 000,00', 500_000_000],
    ['5000000', 500_000_000],
    ['5.000.000', 500_000_000],
    ['5.000.000,5', 500_000_050],
    ['1 500,50 Kz', 150_050],
    ['1500.50', 150_050],
    ['1.500', 150_000],
    ['250 000,00 Kz', 25_000_000],
    ['0', 0],
    ['0,99', 99],
  ])('%j → %d cêntimos', (texto, centimos) => {
    expect(lerKz(texto)).toBe(centimos);
  });

  it.each(['', 'abc', '-5', '1,234', '1.50.000', '5 000 000,000', '1e6', '100000000001', '12,5,0'])('recusa %j', (texto) => {
    expect(lerKz(texto)).toBeNull();
  });

  it('para editar: 5 000 000,00', () => {
    expect(kzParaCampo(500_000_050)).toBe('5 000 000,50');
    expect(kzParaCampo(0)).toBe('0,00');
    expect(lerKz(kzParaCampo(123_456_789))).toBe(123_456_789);
  });

  it('o formulário aceita texto em Kwanza; a API aceita cêntimos; vazio é zero', () => {
    expect(dadosRubrica.parse({ categoria: 'Local', descricao: 'Sala', previsto: '1 000,00', real: '' })).toMatchObject({ previsto: 100_000, real: 0 });
    expect(dadosRubrica.parse({ categoria: 'Local', descricao: 'Sala', previsto: 100_000 })).toMatchObject({ previsto: 100_000, real: 0 });
    for (const mau of [{ previsto: -1 }, { previsto: 1.5 }, { previsto: 'mil' }, { categoria: 'Bebidas' }]) {
      expect(dadosRubrica.safeParse({ categoria: 'Local', descricao: 'Sala', ...mau }).success, JSON.stringify(mau)).toBe(false);
    }
  });
});

describe('categorias e contingência', () => {
  it('as categorias são as da folha Taxonomia do Excel', () => {
    const taxonomia = JSON.parse(readFileSync('data/templates/taxonomia.json', 'utf8'));
    expect([...CATEGORIAS_ORCAMENTO].sort()).toEqual([...taxonomia.categoriasOrcamento].sort());
  });

  it('a rubrica "Contingência (N%)" de cada template passa a percentagem', () => {
    for (const [codigo, esperada] of [
      ['T01', 10],
      ['T02', 15],
      ['T03', 10],
      ['T04', 15],
    ] as const) {
      const t = JSON.parse(readFileSync(`data/templates/${codigo}.json`, 'utf8'));
      const { rubricas, percentagem } = separarContingencia(t.rubricas as { descricao: string }[]);
      expect(percentagem, codigo).toBe(esperada);
      expect(rubricas).toHaveLength(t.rubricas.length - 1);
      expect(rubricas.some((r) => /conting/i.test(r.descricao))).toBe(false);
    }
    expect(separarContingencia([{ descricao: 'Sala' }]).percentagem).toBe(10);
  });

  it('totais por categoria, contingência e estado', () => {
    const itens = (l: [string, number, number][]): Pick<ItemOrcamento, 'categoria' | 'previstoCentimos' | 'realCentimos'>[] =>
      l.map(([categoria, previstoCentimos, realCentimos]) => ({ categoria, previstoCentimos, realCentimos }));
    const base = itens([
      ['Outros', 10_000, 0],
      ['Local', 100_000, 90_000],
      ['Local', 50_000, 50_000],
      ['Artístico', 40_000, 0],
    ]);
    const r = resumirOrcamento(base, 10);
    expect(r.categorias).toEqual([
      { categoria: 'Local', previsto: 150_000, real: 140_000, variacao: -10_000 },
      { categoria: 'Artístico', previsto: 40_000, real: 0, variacao: -40_000 },
      { categoria: 'Outros', previsto: 10_000, real: 0, variacao: -10_000 },
    ]);
    expect(r).toMatchObject({ subtotalPrevisto: 200_000, contingencia: 20_000, totalPrevisto: 220_000, totalReal: 140_000, estado: 'ok', rubricasExcedidas: 0 });
    // Passa do previsto mas cabe na contingência.
    expect(resumirOrcamento(itens([['Local', 100_000, 105_000]]), 10)).toMatchObject({ estado: 'contingencia', rubricasExcedidas: 1, variacao: 5_000 });
    // Passa de tudo.
    expect(resumirOrcamento(itens([['Local', 100_000, 110_001]]), 10).estado).toBe('excedido');
    expect(resumirOrcamento(itens([['Local', 100_000, 110_000]]), 10).estado).toBe('contingencia');
    expect(resumirOrcamento(itens([['Local', 100_000, 100_001]]), 0).estado).toBe('excedido');
    // Arredondamento ao cêntimo.
    expect(resumirOrcamento(itens([['Local', 333, 0]]), 15).contingencia).toBe(50);
    expect(resumirOrcamento([], 10)).toMatchObject({ categorias: [], totalPrevisto: 0, estado: 'ok' });
  });
});

const base = criarBaseDeDados(URL_BD_TESTE);
let c: Awaited<ReturnType<typeof criarCliente>>;

beforeAll(async () => {
  await aplicarMigracoes(base, 'drizzle');
});
beforeEach(async () => {
  await limparBaseDeDados(base.pool);
  c = await criarCliente(base);
});
afterAll(async () => {
  await c.app.close();
  await base.fechar();
});

async function contaConfirmada(email: string, nome: string) {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return { cookie, id: (await c.eu(cookie)).json().id as string };
}

async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie)).json().id;
  const pessoas: Record<string, { cookie: string; id: string }> = {};
  for (const [email, nome, papel] of [
    ['bruno@exemplo.ao', 'Bruno Neto', 'editor'],
    ['carla@exemplo.ao', 'Carla Lima', 'viewer'],
  ] as const) {
    const pessoa = await contaConfirmada(email, nome);
    const ligacao: string = (await c.post('/api/equipa/convites', { email }, ana.cookie)).json().ligacao;
    await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, pessoa.cookie);
    await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: pessoa.id, papel }, ana.cookie);
    pessoas[email] = pessoa;
  }
  const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
  const daEva: string = (await c.post('/api/projectos', { template: 'T01', nome: 'Da Eva', dataEvento: somarDias(hojeEmLuanda(), 30) }, eva.cookie)).json().id;
  return { ana, bruno: pessoas['bruno@exemplo.ao']!, carla: pessoas['carla@exemplo.ao']!, eva, projecto, daEva };
}

const projecto = async (cookie: string, id: string) => (await c.get(`/api/projectos/${id}`, cookie)).json();
const alterarRubrica = (cookie: string, p: string, r: string, dados: object) => c.post(`/api/projectos/${p}/orcamento/${r}`, dados, cookie);
const novaRubrica = (cookie: string, p: string, dados: object) => c.post(`/api/projectos/${p}/orcamento`, dados, cookie);
const removerRubrica = (cookie: string, p: string, r: string) => c.post(`/api/projectos/${p}/orcamento/${r}/remover`, {}, cookie);
const mudarContingencia = (cookie: string, p: string, percentagem: unknown) => c.post(`/api/projectos/${p}/contingencia`, { percentagem }, cookie);

describe('orçamento do projecto', () => {
  it('ao criar o projecto, a contingência do template passa a percentagem e não é uma rubrica', async () => {
    const { ana, projecto: id } = await cenario();
    const p = await projecto(ana.cookie, id);
    expect(p.contingencia).toBe(10);
    expect(p.orcamento).toHaveLength(9);
    expect(p.orcamento.some((i: ItemOrcamento) => /conting/i.test(i.descricao))).toBe(false);
  });

  it('alterar valores (em texto ou cêntimos); as obrigatórias mantêm categoria e descrição', async () => {
    const { ana, projecto: id } = await cenario();
    const [sala, projeccao] = (await projecto(ana.cookie, id)).orcamento as ItemOrcamento[];
    expect(sala!.obrigatoria).toBe(true);
    const r = await alterarRubrica(ana.cookie, id, sala!.id, { categoria: 'Outros', descricao: 'Mudada', previsto: '500 000,00', real: '520 000' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ categoria: 'Local', descricao: 'Aluguer de sala', previstoCentimos: 50_000_000, realCentimos: 52_000_000 });
    const opcional = (await projecto(ana.cookie, id)).orcamento.find((i: ItemOrcamento) => !i.obrigatoria) as ItemOrcamento;
    const mudada = await alterarRubrica(ana.cookie, id, opcional.id, { categoria: 'Outros', descricao: 'Ecrã LED', previsto: 100_000 });
    expect(mudada.json()).toMatchObject({ categoria: 'Outros', descricao: 'Ecrã LED', previstoCentimos: 100_000, realCentimos: 0 });
    expect(projeccao).toBeDefined();
  });

  it('acrescentar e remover rubricas; as obrigatórias não se removem', async () => {
    const { ana, projecto: id } = await cenario();
    const nova = await novaRubrica(ana.cookie, id, { categoria: 'Transporte', descricao: 'Autocarro para jornalistas', previsto: '150 000' });
    expect(nova.statusCode).toBe(201);
    const p = await projecto(ana.cookie, id);
    expect(p.orcamento.at(-1)).toMatchObject({ descricao: 'Autocarro para jornalistas', obrigatoria: false, previstoCentimos: 15_000_000 });
    expect((await removerRubrica(ana.cookie, id, nova.json().id)).statusCode).toBe(204);
    expect((await removerRubrica(ana.cookie, id, nova.json().id)).statusCode).toBe(404);
    const obrigatoria = p.orcamento.find((i: ItemOrcamento) => i.obrigatoria) as ItemOrcamento;
    const recusa = await removerRubrica(ana.cookie, id, obrigatoria.id);
    expect(recusa.statusCode).toBe(409);
    expect((await projecto(ana.cookie, id)).orcamento).toHaveLength(9);
  });

  it('dados inválidos dão 400 com o erro junto ao campo; o limite de 300 rubricas', async () => {
    const { ana, projecto: id } = await cenario();
    for (const [dados, campo] of [
      [{ categoria: 'Bebidas', descricao: 'X' }, 'categoria'],
      [{ categoria: 'Local', descricao: '' }, 'descricao'],
      [{ categoria: 'Local', descricao: 'X', previsto: 'mil' }, 'previsto'],
      [{ categoria: 'Local', descricao: 'X', real: -5 }, 'real'],
      [{ categoria: 'Local', descricao: 'X', previsto: 10_000_000_000_001 }, 'previsto'],
    ] as const) {
      const r = await novaRubrica(ana.cookie, id, dados);
      expect(r.statusCode, JSON.stringify(dados)).toBe(400);
      expect(r.json().campos).toHaveProperty(campo);
    }
    await base.pool.query("insert into budget_items (project_id, position, category, description) select $1, 100 + n, 'Outros', 'R' || n from generate_series(1, 291) n", [id]);
    expect((await novaRubrica(ana.cookie, id, { categoria: 'Local', descricao: 'A mais' })).statusCode).toBe(409);
  });

  it('contingência: alterar a percentagem (0 a 50)', async () => {
    const { ana, projecto: id } = await cenario();
    expect((await mudarContingencia(ana.cookie, id, '15')).json()).toEqual({ contingencia: 15 });
    expect((await projecto(ana.cookie, id)).contingencia).toBe(15);
    expect((await mudarContingencia(ana.cookie, id, 0)).statusCode).toBe(200);
    for (const mau of [51, -1, 2.5, 'dez', '']) expect((await mudarContingencia(ana.cookie, id, mau)).statusCode, String(mau)).toBe(400);
  });
});

describe('quem pode', () => {
  it('o editor altera; a leitora vê mas não altera', async () => {
    const { bruno, carla, projecto: id } = await cenario();
    const item = (await projecto(bruno.cookie, id)).orcamento[0] as ItemOrcamento;
    expect((await alterarRubrica(bruno.cookie, id, item.id, { categoria: 'Local', descricao: 'X', previsto: 1000 })).statusCode).toBe(200);
    expect((await mudarContingencia(bruno.cookie, id, 12)).statusCode).toBe(200);

    const daCarla = await projecto(carla.cookie, id);
    expect(daCarla.orcamento[0].previstoCentimos).toBe(1000);
    expect(daCarla.contingencia).toBe(12);
    expect((await alterarRubrica(carla.cookie, id, item.id, { categoria: 'Local', descricao: 'X', previsto: 1 })).statusCode).toBe(403);
    expect((await novaRubrica(carla.cookie, id, { categoria: 'Local', descricao: 'X' })).statusCode).toBe(403);
    expect((await removerRubrica(carla.cookie, id, item.id)).statusCode).toBe(403);
    expect((await mudarContingencia(carla.cookie, id, 20)).statusCode).toBe(403);
  });

  it('alguém de fora, sem sessão, ou uma rubrica de outro projecto no endereço: como se não existisse', async () => {
    const { ana, eva, projecto: id, daEva } = await cenario();
    const item = (await projecto(ana.cookie, id)).orcamento[1] as ItemOrcamento;
    expect((await alterarRubrica(eva.cookie, id, item.id, { categoria: 'Local', descricao: 'X', previsto: 1 })).statusCode).toBe(404);
    expect((await novaRubrica(eva.cookie, id, { categoria: 'Local', descricao: 'X' })).statusCode).toBe(404);
    expect((await mudarContingencia(eva.cookie, id, 20)).statusCode).toBe(404);
    // A Eva usa o seu projecto com o ID de uma rubrica da Ana.
    expect((await alterarRubrica(eva.cookie, daEva, item.id, { categoria: 'Local', descricao: 'X', previsto: 1 })).statusCode).toBe(404);
    expect((await removerRubrica(eva.cookie, daEva, item.id)).statusCode).toBe(404);
    expect((await alterarRubrica('', id, item.id, { categoria: 'Local', descricao: 'X' })).statusCode).toBe(401);
    expect((await alterarRubrica(ana.cookie, id, 'abc', { categoria: 'Local', descricao: 'X' })).statusCode).toBe(404);
    const depois = (await projecto(ana.cookie, id)).orcamento[1];
    expect(depois).toEqual(item);
  });

  it('projecto arquivado: não se altera', async () => {
    const { ana, projecto: id } = await cenario();
    const item = (await projecto(ana.cookie, id)).orcamento[1] as ItemOrcamento;
    await c.post(`/api/projectos/${id}/arquivar`, {}, ana.cookie);
    expect((await alterarRubrica(ana.cookie, id, item.id, { categoria: 'Local', descricao: 'X', previsto: 1 })).statusCode).toBe(409);
    expect((await novaRubrica(ana.cookie, id, { categoria: 'Local', descricao: 'X' })).statusCode).toBe(409);
    expect((await removerRubrica(ana.cookie, id, item.id)).statusCode).toBe(409);
    expect((await mudarContingencia(ana.cookie, id, 20)).statusCode).toBe(409);
  });

  it('a exportação do dono inclui os valores e a contingência', async () => {
    const { ana, projecto: id } = await cenario();
    const item = (await projecto(ana.cookie, id)).orcamento[0] as ItemOrcamento;
    await alterarRubrica(ana.cookie, id, item.id, { categoria: 'Local', descricao: 'X', previsto: 123_456, real: 7 });
    const exp = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, ana.cookie)).json();
    expect(exp.projectos[0].contingencia).toBe(10);
    expect(exp.projectos[0].orcamento[0]).toMatchObject({ previstoCentimos: 123_456, realCentimos: 7 });
  });
});

describe('migração 0012 (projectos criados antes)', () => {
  it('a rubrica "Contingência (N%)" a zero passa a percentagem do projecto e sai da lista', async () => {
    const { ana, projecto: id, daEva } = await cenario();
    // Como estavam os projectos antes: com a rubrica de contingência (aqui a 15%, e uma com valores, que fica).
    await base.pool.query(
      `insert into budget_items (project_id, position, category, description, required) values ($1, 99, 'Outros', 'Contingência (15%)', true)`,
      [id],
    );
    await base.pool.query(
      `insert into budget_items (project_id, position, category, description, required, planned_cents) values ($1, 99, 'Outros', 'Contingência (10%)', true, 500)`,
      [daEva],
    );
    await base.pool.query("update projects set contingency_pct = 10 where id = $1", [id]);
    const sql = readFileSync('drizzle/0012_orcamento.sql', 'utf8');
    const dados = sql.slice(sql.indexOf('-- Escrito à mão'));
    for (const instrucao of dados.split('--> statement-breakpoint')) await base.pool.query(instrucao);

    const p = await projecto(ana.cookie, id);
    expect(p.contingencia).toBe(15);
    expect(p.orcamento.some((i: ItemOrcamento) => /conting/i.test(i.descricao))).toBe(false);
    // Com valores não se apaga (não se perde nada que alguém tenha escrito).
    expect((await base.pool.query("select count(*)::int as n from budget_items where project_id = $1 and description like 'Conting%'", [daEva])).rows[0].n).toBe(1);
  });
});
