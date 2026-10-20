// Ligações de RSVP por convidado e página pública de resposta (decisão 018).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarLigacoesRsvp } from '../src/server/convidados/rsvp.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import type { Convidado } from '../src/shared/convidados.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { configTeste, limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente } from './cliente.js';

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

// A Ana tem um projecto com dois convidados; o Bruno é editor e a Carla leitora.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (
    await c.post('/api/projectos', { template: 'T01', nome: 'Gala <i>2026</i>', dataEvento: somarDias(hojeEmLuanda(), 30), local: 'Hotel Presidente' }, ana.cookie)
  ).json().id;
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
  const tio: Convidado = (await c.post(`/api/projectos/${projecto}/convidados`, { nome: 'Tio Zeca', telemovel: '923456789', acompanhantes: 2 }, ana.cookie)).json();
  const prima: Convidado = (await c.post(`/api/projectos/${projecto}/convidados`, { nome: 'Prima Lú' }, ana.cookie)).json();
  return { ana, bruno: pessoas['bruno@exemplo.ao']!, carla: pessoas['carla@exemplo.ao']!, projecto, tio, prima };
}

const pedirLigacao = (cookie: string, projecto: string, convidado: string, nova = false) =>
  c.post(`/api/projectos/${projecto}/convidados/${convidado}/ligacao${nova ? '/nova' : ''}`, {}, cookie);

async function tokenDe(cookie: string, projecto: string, convidado: string, nova = false): Promise<string> {
  const r = await pedirLigacao(cookie, projecto, convidado, nova);
  expect(r.statusCode).toBe(200);
  const url = new URL(r.json().ligacao);
  expect(url.origin + url.pathname).toBe('http://localhost:3000/rsvp');
  return url.searchParams.get('token')!;
}

const ver = (token: string, ip?: string) => c.post('/api/rsvp/ver', { token }, undefined, ip);
const responder = (dados: object) => c.post('/api/rsvp/responder', dados);

describe('o token', () => {
  const ligacoes = criarLigacoesRsvp(configTeste());
  const chave = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('lê-se de volta para a chave; adulterado, de outra chave ou com outro segredo, não', () => {
    const token = ligacoes.token(chave);
    expect(token).toMatch(/^[0-9a-f]{32}[A-Za-z0-9_-]{22}$/);
    expect(ligacoes.ler(token)).toBe(chave);
    const outraChave = ligacoes.token('1f8fad5b-d9cb-469f-a165-70867728950e');
    expect(ligacoes.ler(`${token.slice(0, 32)}${outraChave.slice(32)}`)).toBeNull();
    expect(ligacoes.ler(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(criarLigacoesRsvp(configTeste({ SESSION_SECRET: 'y'.repeat(32) })).ler(token)).toBeNull();
    for (const mau of ['', 'abc', `${token}x`, token.toUpperCase(), `${chave}${token.slice(32)}`]) expect(ligacoes.ler(mau)).toBeNull();
  });
});

describe('ligações para o organizador', () => {
  it('o dono e o editor obtêm a ligação; é sempre a mesma até se pedir uma nova', async () => {
    const { ana, bruno, projecto, tio } = await cenario();
    const t1 = await tokenDe(ana.cookie, projecto, tio.id);
    expect(await tokenDe(bruno.cookie, projecto, tio.id)).toBe(t1);
    const t2 = await tokenDe(ana.cookie, projecto, tio.id, true);
    expect(t2).not.toBe(t1);
    expect((await ver(t1)).statusCode).toBe(404);
    expect((await ver(t2)).statusCode).toBe(200);
  });

  it('cada convidado tem a sua ligação', async () => {
    const { ana, projecto, tio, prima } = await cenario();
    expect(await tokenDe(ana.cookie, projecto, tio.id)).not.toBe(await tokenDe(ana.cookie, projecto, prima.id));
  });

  it('a leitora, quem é de fora, sem sessão e o projecto arquivado: sem ligação', async () => {
    const { ana, carla, projecto, tio } = await cenario();
    expect((await pedirLigacao(carla.cookie, projecto, tio.id)).statusCode).toBe(403);
    expect((await pedirLigacao(carla.cookie, projecto, tio.id, true)).statusCode).toBe(403);
    const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
    expect((await pedirLigacao(eva.cookie, projecto, tio.id)).statusCode).toBe(404);
    expect((await pedirLigacao('', projecto, tio.id)).statusCode).toBe(401);
    // Com o ID do convidado da Ana no endereço do projecto da Eva.
    const daEva: string = (await c.post('/api/projectos', { template: 'T01', nome: 'Da Eva', dataEvento: somarDias(hojeEmLuanda(), 30) }, eva.cookie)).json().id;
    expect((await pedirLigacao(eva.cookie, daEva, tio.id)).statusCode).toBe(404);
    expect((await pedirLigacao(eva.cookie, daEva, tio.id, true)).statusCode).toBe(404);
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await pedirLigacao(ana.cookie, projecto, tio.id)).statusCode).toBe(409);
  });

  it('a ligação não aparece na lista nem na exportação', async () => {
    const { ana, projecto, tio } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    const chave = (await base.pool.query('select rsvp_key from guests where id = $1', [tio.id])).rows[0].rsvp_key as string;
    const lista = await c.get(`/api/projectos/${projecto}/convidados`, ana.cookie);
    const exportacao = await c.post('/api/conta/exportar', { palavraPasse: 'Kizomba-2026-evento' }, ana.cookie);
    for (const r of [lista, exportacao]) {
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain(token.slice(0, 32));
      expect(r.body).not.toContain(chave);
    }
  });
});

describe('página pública de RSVP', () => {
  it('mostra o convite só daquele convidado, sem dados de mais ninguém', async () => {
    const { ana, projecto, tio } = await cenario();
    const r = await ver(await tokenDe(ana.cookie, projecto, tio.id));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      evento: 'Gala <i>2026</i>',
      dataEvento: somarDias(hojeEmLuanda(), 30),
      local: 'Hotel Presidente',
      convidado: 'Tio Zeca',
      acompanhantes: 2,
      resposta: 'pending',
      acompanhantesConfirmados: 0,
      aberto: true,
    });
    for (const alheio of ['Prima Lú', 'Ana Domingos', 'ana@exemplo.ao', '923456789', tio.id, projecto]) expect(r.body).not.toContain(alheio);
  });

  it('responder "vou" com acompanhantes, mudar para "não vou" e voltar: o organizador vê cada mudança', async () => {
    const { ana, projecto, tio } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    const vou = await responder({ token, resposta: 'yes', acompanhantes: 1 });
    expect(vou.statusCode).toBe(200);
    expect(vou.json()).toMatchObject({ resposta: 'yes', acompanhantesConfirmados: 1 });
    let g = (await c.get(`/api/projectos/${projecto}/convidados`, ana.cookie)).json();
    expect(g.convidados.find((x: Convidado) => x.id === tio.id)).toMatchObject({ resposta: 'yes', acompanhantesConfirmados: 1 });
    expect(g.totais).toMatchObject({ vao: 1, pessoas: 2 });

    expect((await responder({ token, resposta: 'no', acompanhantes: 2 })).json()).toMatchObject({ resposta: 'no', acompanhantesConfirmados: 0 });
    // Mais acompanhantes do que os permitidos: fica nos permitidos.
    expect((await responder({ token, resposta: 'yes', acompanhantes: 9 })).json()).toMatchObject({ resposta: 'yes', acompanhantesConfirmados: 2 });
    g = (await c.get(`/api/projectos/${projecto}/convidados`, ana.cookie)).json();
    expect(g.convidados.find((x: Convidado) => x.id === tio.id).respondidoEm).not.toBeNull();
    expect(g.totais).toMatchObject({ convidados: 2, vao: 1, pessoas: 3 });
  });

  it('nunca cria convidados nem toca nos outros', async () => {
    const { ana, projecto, tio, prima } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    await responder({ token, resposta: 'yes', nome: 'Estranho', convidadoId: prima.id, projectoId: projecto });
    const { rows } = await base.pool.query('select name, response from guests order by name');
    expect(rows).toEqual([
      { name: 'Prima Lú', response: 'pending' },
      { name: 'Tio Zeca', response: 'yes' },
    ]);
  });

  it('ligações inválidas, adulteradas, de convidado removido ou substituídas: a mesma resposta', async () => {
    const { ana, projecto, tio, prima } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    const daPrima = await tokenDe(ana.cookie, projecto, prima.id);
    await c.post(`/api/projectos/${projecto}/convidados/${prima.id}/remover`, {}, ana.cookie);
    // Chave do Tio com a assinatura da Prima.
    const misturado = `${token.slice(0, 32)}${daPrima.slice(32)}`;
    const respostas = [];
    for (const mau of ['abc', '', misturado, daPrima, "' or 1=1 --", 'x'.repeat(100)]) {
      const r = await ver(mau);
      expect(r.statusCode, mau).toBeGreaterThanOrEqual(400);
      expect(r.statusCode, mau).toBeLessThan(500);
      if (r.statusCode === 404) respostas.push(r.body);
      expect((await responder({ token: mau, resposta: 'yes' })).statusCode, mau).toBeGreaterThanOrEqual(400);
    }
    expect(new Set(respostas).size).toBe(1);
    expect((await base.pool.query("select count(*)::int as n from guests where response <> 'pending'")).rows[0].n).toBe(0);
  });

  it('dados inválidos dão 400', async () => {
    const { ana, projecto, tio } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    for (const dados of [{ token }, { token, resposta: 'pending' }, { token, resposta: 'talvez' }, { token, resposta: 'yes', acompanhantes: -1 }]) {
      expect((await responder(dados)).statusCode, JSON.stringify(dados)).toBe(400);
    }
  });

  it('pode responder até ao dia do evento, inclusive; depois, ou com o projecto arquivado, não', async () => {
    const { ana, projecto, tio } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    await base.pool.query('update projects set event_date = $2 where id = $1', [projecto, hojeEmLuanda()]);
    expect((await ver(token)).json().aberto).toBe(true);
    expect((await responder({ token, resposta: 'yes' })).statusCode).toBe(200);

    await base.pool.query('update projects set event_date = $2 where id = $1', [projecto, somarDias(hojeEmLuanda(), -1)]);
    expect((await ver(token)).json()).toMatchObject({ aberto: false, resposta: 'yes' });
    const tarde = await responder({ token, resposta: 'no' });
    expect(tarde.statusCode).toBe(409);
    expect(tarde.json().mensagem).toMatch(/já aconteceu/);

    await base.pool.query('update projects set event_date = $2 where id = $1', [projecto, somarDias(hojeEmLuanda(), 10)]);
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await ver(token)).json().aberto).toBe(false);
    expect((await responder({ token, resposta: 'no' })).statusCode).toBe(409);
    expect((await base.pool.query('select response from guests where id = $1', [tio.id])).rows[0].response).toBe('yes');
  });

  it('limite de pedidos por IP', async () => {
    const { ana, projecto, tio } = await cenario();
    const token = await tokenDe(ana.cookie, projecto, tio.id);
    await base.pool.query("insert into rate_limits (key, count, window_start) values ('rsvp-ip:203.0.113.9', 300, now())");
    expect((await ver(token, '203.0.113.9')).statusCode).toBe(429);
    expect((await ver(token, '203.0.113.10')).statusCode).toBe(200);
  });
});
