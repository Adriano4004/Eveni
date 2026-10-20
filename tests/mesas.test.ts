// Mesas e lugares (decisão 018).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { type Convidado, lugaresDoConvidado, type Mesa, ocupacaoDasMesas } from '../src/shared/convidados.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
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

// A Ana tem um projecto (com o Bruno editor e a Carla leitora); a Eva tem o seu.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto = await novoProjecto(ana.cookie, 'Casamento');
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

const criarMesa = (cookie: string, projecto: string, dados: object) => c.post(`/api/projectos/${projecto}/mesas`, dados, cookie);
const criarVarias = (cookie: string, projecto: string, dados: object) => c.post(`/api/projectos/${projecto}/mesas/varias`, dados, cookie);
const alterarMesa = (cookie: string, projecto: string, mesa: string, dados: object) => c.post(`/api/projectos/${projecto}/mesas/${mesa}`, dados, cookie);
const apagarMesa = (cookie: string, projecto: string, mesa: string) => c.post(`/api/projectos/${projecto}/mesas/${mesa}/remover`, {}, cookie);
const sentar = (cookie: string, projecto: string, convidado: string, mesaId: string | null) =>
  c.post(`/api/projectos/${projecto}/convidados/${convidado}/mesa`, { mesaId }, cookie);
const convidado = async (cookie: string, projecto: string, dados: object): Promise<Convidado> =>
  (await c.post(`/api/projectos/${projecto}/convidados`, dados, cookie)).json();
const lista = async (cookie: string, projecto: string) => (await c.get(`/api/projectos/${projecto}/convidados`, cookie)).json();

describe('lugares ocupados', () => {
  it('quem vai conta com os acompanhantes confirmados; sem resposta, com todos os permitidos; quem não vai, zero', () => {
    expect(lugaresDoConvidado({ resposta: 'yes', acompanhantes: 3, acompanhantesConfirmados: 1 })).toBe(2);
    expect(lugaresDoConvidado({ resposta: 'pending', acompanhantes: 3, acompanhantesConfirmados: 0 })).toBe(4);
    expect(lugaresDoConvidado({ resposta: 'no', acompanhantes: 3, acompanhantesConfirmados: 0 })).toBe(0);
    const ocupacao = ocupacaoDasMesas([
      { mesaId: 'a', resposta: 'yes', acompanhantes: 2, acompanhantesConfirmados: 2 },
      { mesaId: 'a', resposta: 'pending', acompanhantes: 0, acompanhantesConfirmados: 0 },
      { mesaId: 'b', resposta: 'no', acompanhantes: 1, acompanhantesConfirmados: 0 },
      { mesaId: null, resposta: 'yes', acompanhantes: 0, acompanhantesConfirmados: 0 },
    ]);
    expect(Object.fromEntries(ocupacao)).toEqual({ a: 4, b: 0 });
  });
});

describe('criar, alterar e apagar mesas', () => {
  it('cria uma mesa e várias de uma vez, a continuar a numeração; a lista vem por ordem natural', async () => {
    const { ana, projecto } = await cenario();
    expect((await criarMesa(ana.cookie, projecto, { nome: 'Mesa dos noivos', lugares: '8' })).statusCode).toBe(201);
    expect((await criarMesa(ana.cookie, projecto, { nome: 'Mesa 2', lugares: 10 })).statusCode).toBe(201);
    const varias = await criarVarias(ana.cookie, projecto, { quantidade: '10', lugares: '10' });
    expect(varias.statusCode).toBe(200);
    const nomes = (await lista(ana.cookie, projecto)).mesas.map((m: Mesa) => m.nome);
    expect(nomes).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 8', 'Mesa 9', 'Mesa 10', 'Mesa 11', 'Mesa dos noivos']);
    expect(varias.json()).toHaveLength(12);
  });

  it('nomes repetidos (sem ligar a maiúsculas) e dados inválidos são recusados junto ao campo', async () => {
    const { ana, projecto } = await cenario();
    await criarMesa(ana.cookie, projecto, { nome: 'Mesa de honra', lugares: 8 });
    const repetida = await criarMesa(ana.cookie, projecto, { nome: 'MESA DE HONRA', lugares: 8 });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().campos).toHaveProperty('nome');
    for (const [dados, campo] of [
      [{ nome: '', lugares: 8 }, 'nome'],
      [{ nome: 'X', lugares: 0 }, 'lugares'],
      [{ nome: 'X', lugares: 101 }, 'lugares'],
      [{ nome: 'X', lugares: '' }, 'lugares'],
      [{ nome: 'X', lugares: 2.5 }, 'lugares'],
    ] as const) {
      const r = await criarMesa(ana.cookie, projecto, dados);
      expect(r.statusCode, JSON.stringify(dados)).toBe(400);
      expect(r.json().campos).toHaveProperty(campo);
    }
    for (const quantidade of [0, 51, 'x']) expect((await criarVarias(ana.cookie, projecto, { quantidade, lugares: 8 })).statusCode).toBe(400);
  });

  it('o limite de 200 mesas por projecto', async () => {
    const { ana, projecto } = await cenario();
    await base.pool.query("insert into event_tables (project_id, name, seats) select $1, 'M' || n, 8 from generate_series(1, 199) n", [projecto]);
    expect((await criarVarias(ana.cookie, projecto, { quantidade: 2, lugares: 8 })).statusCode).toBe(409);
    expect((await criarMesa(ana.cookie, projecto, { nome: 'A última', lugares: 8 })).statusCode).toBe(201);
    expect((await criarMesa(ana.cookie, projecto, { nome: 'Uma a mais', lugares: 8 })).statusCode).toBe(409);
  });

  it('alterar nome e lugares; apagar a mesa deixa os convidados sem mesa, sem os apagar', async () => {
    const { ana, projecto } = await cenario();
    const mesa: Mesa = (await criarMesa(ana.cookie, projecto, { nome: 'Mesa 1', lugares: 8 })).json();
    await criarMesa(ana.cookie, projecto, { nome: 'Mesa 2', lugares: 8 });
    expect((await alterarMesa(ana.cookie, projecto, mesa.id, { nome: 'Mesa 2', lugares: 8 })).statusCode).toBe(409);
    expect((await alterarMesa(ana.cookie, projecto, mesa.id, { nome: 'Mesa de honra', lugares: 12 })).json()).toEqual({
      id: mesa.id,
      nome: 'Mesa de honra',
      lugares: 12,
    });
    const g = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca' });
    await sentar(ana.cookie, projecto, g.id, mesa.id);
    expect((await apagarMesa(ana.cookie, projecto, mesa.id)).statusCode).toBe(204);
    expect((await apagarMesa(ana.cookie, projecto, mesa.id)).statusCode).toBe(404);
    const depois = await lista(ana.cookie, projecto);
    expect(depois.mesas.map((m: Mesa) => m.nome)).toEqual(['Mesa 2']);
    expect(depois.convidados).toEqual([expect.objectContaining({ nome: 'Tio Zeca', mesaId: null })]);
  });
});

describe('sentar convidados', () => {
  it('sentar, mudar de mesa e tirar; a ocupação conta com os acompanhantes e pode passar da lotação', async () => {
    const { ana, projecto } = await cenario();
    const m1: Mesa = (await criarMesa(ana.cookie, projecto, { nome: 'Mesa 1', lugares: 3 })).json();
    const m2: Mesa = (await criarMesa(ana.cookie, projecto, { nome: 'Mesa 2', lugares: 8 })).json();
    const tio = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca', acompanhantes: 2 });
    const prima = await convidado(ana.cookie, projecto, { nome: 'Prima Lú' });
    expect((await sentar(ana.cookie, projecto, tio.id, m1.id)).json()).toMatchObject({ id: tio.id, mesaId: m1.id });
    // Passar da lotação é permitido (o ecrã avisa).
    expect((await sentar(ana.cookie, projecto, prima.id, m1.id)).statusCode).toBe(200);
    let l = await lista(ana.cookie, projecto);
    expect(Object.fromEntries(ocupacaoDasMesas(l.convidados))).toEqual({ [m1.id]: 4 });

    await sentar(ana.cookie, projecto, prima.id, m2.id);
    expect((await sentar(ana.cookie, projecto, tio.id, null)).json().mesaId).toBeNull();
    l = await lista(ana.cookie, projecto);
    expect(l.convidados.map((g: Convidado) => [g.nome, g.mesaId])).toEqual([
      ['Prima Lú', m2.id],
      ['Tio Zeca', null],
    ]);
  });

  it('uma mesa de outro projecto, inexistente ou inválida: recusada, e a base de dados também o garante', async () => {
    const { ana, eva, projecto, daEva } = await cenario();
    const tio = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca' });
    const daEvaMesa: Mesa = (await criarMesa(eva.cookie, daEva, { nome: 'Mesa 1', lugares: 8 })).json();
    const r = await sentar(ana.cookie, projecto, tio.id, daEvaMesa.id);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toHaveProperty('mesaId');
    expect((await sentar(ana.cookie, projecto, tio.id, '0f8fad5b-d9cb-469f-a165-70867728950e')).statusCode).toBe(400);
    expect((await sentar(ana.cookie, projecto, tio.id, 'abc' as string)).statusCode).toBe(400);
    await expect(base.pool.query('update guests set table_id = $2 where id = $1', [tio.id, daEvaMesa.id])).rejects.toThrow(/guests_mesa_do_projecto/);
    expect((await lista(ana.cookie, projecto)).convidados[0].mesaId).toBeNull();
  });

  it('um convidado de outro projecto não se senta pelo endereço do meu projecto', async () => {
    const { ana, eva, projecto, daEva } = await cenario();
    const tio = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca' });
    const mesaEva: Mesa = (await criarMesa(eva.cookie, daEva, { nome: 'Mesa 1', lugares: 8 })).json();
    expect((await sentar(eva.cookie, daEva, tio.id, mesaEva.id)).statusCode).toBe(404);
    expect((await lista(ana.cookie, projecto)).convidados[0].mesaId).toBeNull();
  });
});

describe('quem pode', () => {
  it('o editor gere as mesas; a leitora só vê', async () => {
    const { ana, bruno, carla, projecto } = await cenario();
    const mesa: Mesa = (await criarMesa(bruno.cookie, projecto, { nome: 'Mesa 1', lugares: 8 })).json();
    const tio = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca' });
    expect((await sentar(bruno.cookie, projecto, tio.id, mesa.id)).statusCode).toBe(200);

    expect((await lista(carla.cookie, projecto)).mesas).toEqual([mesa]);
    expect((await criarMesa(carla.cookie, projecto, { nome: 'Da Carla', lugares: 8 })).statusCode).toBe(403);
    expect((await criarVarias(carla.cookie, projecto, { quantidade: 2, lugares: 8 })).statusCode).toBe(403);
    expect((await alterarMesa(carla.cookie, projecto, mesa.id, { nome: 'X', lugares: 8 })).statusCode).toBe(403);
    expect((await apagarMesa(carla.cookie, projecto, mesa.id)).statusCode).toBe(403);
    expect((await sentar(carla.cookie, projecto, tio.id, null)).statusCode).toBe(403);
  });

  it('alguém de fora, sem sessão, uma mesa de outro projecto no endereço: como se não existisse', async () => {
    const { ana, eva, projecto, daEva } = await cenario();
    const mesa: Mesa = (await criarMesa(ana.cookie, projecto, { nome: 'Mesa 1', lugares: 8 })).json();
    expect((await criarMesa(eva.cookie, projecto, { nome: 'Intrusa', lugares: 8 })).statusCode).toBe(404);
    expect((await alterarMesa(eva.cookie, projecto, mesa.id, { nome: 'X', lugares: 8 })).statusCode).toBe(404);
    expect((await apagarMesa(eva.cookie, projecto, mesa.id)).statusCode).toBe(404);
    // A Eva com a mesa da Ana no endereço do seu próprio projecto.
    expect((await alterarMesa(eva.cookie, daEva, mesa.id, { nome: 'Roubada', lugares: 8 })).statusCode).toBe(404);
    expect((await apagarMesa(eva.cookie, daEva, mesa.id)).statusCode).toBe(404);
    expect((await criarMesa('', projecto, { nome: 'Anónima', lugares: 8 })).statusCode).toBe(401);
    expect((await alterarMesa(ana.cookie, projecto, 'abc', { nome: 'X', lugares: 8 })).statusCode).toBe(404);
    expect((await lista(ana.cookie, projecto)).mesas).toEqual([mesa]);
  });

  it('projecto arquivado: as mesas vêem-se, mas não se alteram', async () => {
    const { ana, projecto } = await cenario();
    const mesa: Mesa = (await criarMesa(ana.cookie, projecto, { nome: 'Mesa 1', lugares: 8 })).json();
    const tio = await convidado(ana.cookie, projecto, { nome: 'Tio Zeca' });
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await lista(ana.cookie, projecto)).mesas).toEqual([mesa]);
    expect((await criarMesa(ana.cookie, projecto, { nome: 'Mesa 2', lugares: 8 })).statusCode).toBe(409);
    expect((await alterarMesa(ana.cookie, projecto, mesa.id, { nome: 'X', lugares: 8 })).statusCode).toBe(409);
    expect((await apagarMesa(ana.cookie, projecto, mesa.id)).statusCode).toBe(409);
    expect((await sentar(ana.cookie, projecto, tio.id, mesa.id)).statusCode).toBe(409);
  });
});

describe('dados da conta', () => {
  it('a exportação inclui as mesas e a mesa de cada convidado; eliminar a conta apaga tudo', async () => {
    const { eva, daEva } = await cenario();
    const mesa: Mesa = (await criarMesa(eva.cookie, daEva, { nome: 'Mesa de honra', lugares: 8 })).json();
    const g = await convidado(eva.cookie, daEva, { nome: 'Convidado da Eva' });
    await sentar(eva.cookie, daEva, g.id, mesa.id);
    const exportacao = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, eva.cookie)).json();
    expect(exportacao.projectos[0].mesas).toEqual([mesa]);
    expect(exportacao.projectos[0].convidados[0]).toMatchObject({ nome: 'Convidado da Eva', mesaId: mesa.id });
    await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, eva.cookie);
    expect((await base.pool.query('select count(*)::int as n from event_tables')).rows[0].n).toBe(0);
  });
});
