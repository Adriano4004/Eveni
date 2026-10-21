// Fornecedores do espaço de trabalho e ligação às rubricas do orçamento (decisão 019).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import type { Fornecedor } from '../src/shared/fornecedores.js';
import type { ItemOrcamento } from '../src/shared/projectos.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

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

const novoProjecto = async (cookie: string, nome: string) =>
  (await c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie)).json().id as string;

// A Ana tem um projecto com o Bruno (editor) e a Carla (leitora); a Eva tem o seu espaço e projecto.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto = await novoProjecto(ana.cookie, 'Conferência');
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
  const daEva = await novoProjecto(eva.cookie, 'Gala da Eva');
  return { ana, bruno: pessoas['bruno@exemplo.ao']!, carla: pessoas['carla@exemplo.ao']!, eva, projecto, daEva };
}

const FORNECEDOR = { nome: 'Som Kianda', categoria: 'Equipamentos', telemovel: '923 456 789', email: 'Geral@SomKianda.ao', notas: 'Pedir gerador.\r\nPagamento 50% adiantado.' };
const criarF = (cookie: string, dados: object) => c.post('/api/fornecedores', dados, cookie);
const lista = async (cookie: string) => (await c.get('/api/fornecedores', cookie)).json() as Fornecedor[];
const rubricas = async (cookie: string, p: string) => (await c.get(`/api/projectos/${p}`, cookie)).json().orcamento as ItemOrcamento[];
const ligar = (cookie: string, p: string, item: ItemOrcamento, fornecedorId: string | null) =>
  c.post(`/api/projectos/${p}/orcamento/${item.id}`, { categoria: item.categoria, descricao: item.descricao, previsto: item.previstoCentimos, fornecedorId }, cookie);

describe('lista de fornecedores do espaço', () => {
  it('criar, alterar e apagar; telemóvel e e-mail normalizados; por nome', async () => {
    const { ana } = await cenario();
    const r = await criarF(ana.cookie, FORNECEDOR);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ nome: 'Som Kianda', categoria: 'Equipamentos', telemovel: '+244923456789', email: 'geral@somkianda.ao' });
    await criarF(ana.cookie, { nome: 'Buffet da Ilha', categoria: 'Alimentação/Hospedagem' });
    expect((await lista(ana.cookie)).map((f) => f.nome)).toEqual(['Buffet da Ilha', 'Som Kianda']);

    const alterado = await c.post(`/api/fornecedores/${r.json().id}`, { ...FORNECEDOR, nome: 'Som Kianda Lda', notas: '' }, ana.cookie);
    expect(alterado.json()).toMatchObject({ nome: 'Som Kianda Lda', notas: null });
    expect((await c.post(`/api/fornecedores/${r.json().id}/remover`, {}, ana.cookie)).statusCode).toBe(204);
    expect((await c.post(`/api/fornecedores/${r.json().id}/remover`, {}, ana.cookie)).statusCode).toBe(404);
    expect((await lista(ana.cookie)).map((f) => f.nome)).toEqual(['Buffet da Ilha']);
  });

  it('nome repetido (sem ligar a maiúsculas) e dados inválidos: erro junto ao campo', async () => {
    const { ana, eva } = await cenario();
    await criarF(ana.cookie, FORNECEDOR);
    const rep = await criarF(ana.cookie, { ...FORNECEDOR, nome: 'SOM KIANDA' });
    expect(rep.statusCode).toBe(409);
    expect(rep.json().campos).toHaveProperty('nome');
    // Noutro espaço, o mesmo nome pode existir.
    expect((await criarF(eva.cookie, FORNECEDOR)).statusCode).toBe(201);
    for (const [dados, campo] of [
      [{ ...FORNECEDOR, nome: '' }, 'nome'],
      [{ ...FORNECEDOR, categoria: 'Bebidas' }, 'categoria'],
      [{ ...FORNECEDOR, telemovel: '12' }, 'telemovel'],
      [{ ...FORNECEDOR, email: 'x' }, 'email'],
      [{ ...FORNECEDOR, notas: 'x'.repeat(1001) }, 'notas'],
      [{ ...FORNECEDOR, notas: 'a\u0000b' }, 'notas'],
    ] as const) {
      const r = await criarF(ana.cookie, { ...dados, nome: dados.nome === '' ? '' : `Outro ${campo}` });
      expect(r.statusCode, campo).toBe(400);
      expect(r.json().campos).toHaveProperty(campo);
    }
  });

  it('cada um só vê, altera e apaga os do seu espaço', async () => {
    const { ana, eva } = await cenario();
    const daAna: Fornecedor = (await criarF(ana.cookie, FORNECEDOR)).json();
    expect(await lista(eva.cookie)).toEqual([]);
    expect((await c.post(`/api/fornecedores/${daAna.id}`, { ...FORNECEDOR, nome: 'Roubado' }, eva.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/fornecedores/${daAna.id}/remover`, {}, eva.cookie)).statusCode).toBe(404);
    expect((await c.get('/api/fornecedores')).statusCode).toBe(401);
    expect((await c.post('/api/fornecedores/abc', FORNECEDOR, ana.cookie)).statusCode).toBe(404);
    expect((await lista(ana.cookie))[0]!.nome).toBe('Som Kianda');
  });

  it('um membro da equipa não vê a lista do espaço do dono pela rota do espaço (vê a do seu próprio)', async () => {
    const { ana, carla } = await cenario();
    await criarF(ana.cookie, FORNECEDOR);
    const r = await c.get('/api/fornecedores', carla.cookie);
    expect(r.json()).toEqual([]);
    expect(r.body).not.toContain('Som Kianda');
  });
});

describe('fornecedores a partir de um projecto', () => {
  it('o editor vê a lista do espaço do projecto e acrescenta; a leitora não vê a lista', async () => {
    const { ana, bruno, carla, eva, projecto } = await cenario();
    await criarF(ana.cookie, FORNECEDOR);
    const doBruno = await c.post(`/api/projectos/${projecto}/fornecedores`, { nome: 'Flores do Kinaxixi', categoria: 'Decoração/Iluminação' }, bruno.cookie);
    expect(doBruno.statusCode).toBe(201);
    // Fica no espaço da Ana (do projecto), não no do Bruno.
    expect((await lista(ana.cookie)).map((f) => f.nome)).toEqual(['Flores do Kinaxixi', 'Som Kianda']);
    expect(await lista(bruno.cookie)).toEqual([]);
    expect((await c.get(`/api/projectos/${projecto}/fornecedores`, bruno.cookie)).json()).toHaveLength(2);

    const daCarla = await c.get(`/api/projectos/${projecto}/fornecedores`, carla.cookie);
    expect(daCarla.statusCode).toBe(403);
    expect(daCarla.body).not.toContain('923456789');
    expect((await c.post(`/api/projectos/${projecto}/fornecedores`, FORNECEDOR, carla.cookie)).statusCode).toBe(403);
    expect((await c.get(`/api/projectos/${projecto}/fornecedores`, eva.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/projectos/${projecto}/fornecedores`, { nome: 'Intruso', categoria: 'Local' }, eva.cookie)).statusCode).toBe(404);
  });
});

describe('fornecedor nas rubricas', () => {
  it('ligar, mudar e tirar; a leitora vê só o nome', async () => {
    const { ana, bruno, carla, projecto } = await cenario();
    const f: Fornecedor = (await criarF(ana.cookie, FORNECEDOR)).json();
    const item = (await rubricas(ana.cookie, projecto))[1]!;
    const r = await ligar(bruno.cookie, projecto, item, f.id);
    expect(r.statusCode).toBe(200);
    expect(r.json().fornecedor).toEqual({ id: f.id, nome: 'Som Kianda' });
    const vistaCarla = await c.get(`/api/projectos/${projecto}`, carla.cookie);
    expect(vistaCarla.json().orcamento[1].fornecedor).toEqual({ id: f.id, nome: 'Som Kianda' });
    expect(vistaCarla.body).not.toContain('923456789');
    expect(vistaCarla.body).not.toContain('somkianda.ao');

    // Sem fornecedorId, fica como estava; vazio ou null tira.
    const semMexer = await c.post(`/api/projectos/${projecto}/orcamento/${item.id}`, { categoria: item.categoria, descricao: item.descricao, previsto: 5 }, ana.cookie);
    expect(semMexer.json().fornecedor).toEqual({ id: f.id, nome: 'Som Kianda' });
    expect((await ligar(ana.cookie, projecto, item, '' as string)).json().fornecedor).toBeNull();
    // Também numa rubrica nova.
    const nova = await c.post(`/api/projectos/${projecto}/orcamento`, { categoria: 'Local', descricao: 'Tenda', fornecedorId: f.id }, ana.cookie);
    expect(nova.json().fornecedor).toEqual({ id: f.id, nome: 'Som Kianda' });
  });

  it('um fornecedor de OUTRO espaço é recusado (falha da versão anterior), e a base de dados também o recusa', async () => {
    const { ana, eva, projecto } = await cenario();
    const daEva: Fornecedor = (await criarF(eva.cookie, { nome: 'Da Eva', categoria: 'Local' })).json();
    const item = (await rubricas(ana.cookie, projecto))[0]!;
    const r = await ligar(ana.cookie, projecto, item, daEva.id);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toHaveProperty('fornecedorId');
    expect((await c.post(`/api/projectos/${projecto}/orcamento`, { categoria: 'Local', descricao: 'X', fornecedorId: daEva.id }, ana.cookie)).statusCode).toBe(400);
    expect((await ligar(ana.cookie, projecto, item, '0f8fad5b-d9cb-469f-a165-70867728950e')).statusCode).toBe(400);
    expect((await ligar(ana.cookie, projecto, item, 'abc')).statusCode).toBe(400);
    await expect(base.pool.query('update budget_items set supplier_id = $2 where id = $1', [item.id, daEva.id])).rejects.toThrow(/outro espaço/);
    expect((await rubricas(ana.cookie, projecto))[0]!.fornecedor).toBeNull();
  });

  it('apagar o fornecedor tira-o das rubricas, sem as apagar', async () => {
    const { ana, projecto } = await cenario();
    const f: Fornecedor = (await criarF(ana.cookie, FORNECEDOR)).json();
    const item = (await rubricas(ana.cookie, projecto))[0]!;
    await ligar(ana.cookie, projecto, item, f.id);
    await c.post(`/api/fornecedores/${f.id}/remover`, {}, ana.cookie);
    const depois = (await rubricas(ana.cookie, projecto))[0]!;
    expect(depois).toMatchObject({ id: item.id, fornecedor: null });
  });
});

describe('dados da conta', () => {
  it('a exportação do dono inclui os fornecedores; eliminar a conta apaga-os', async () => {
    const { eva } = await cenario();
    await criarF(eva.cookie, FORNECEDOR);
    const exp = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, eva.cookie)).json();
    expect(exp.fornecedores).toEqual([expect.objectContaining({ nome: 'Som Kianda', telemovel: '+244923456789' })]);
    await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, eva.cookie);
    expect((await base.pool.query("select count(*)::int as n from suppliers where name = 'Som Kianda'")).rows[0].n).toBe(0);
  });
});
