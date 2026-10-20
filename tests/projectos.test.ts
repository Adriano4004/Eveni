import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { materializar } from '../src/shared/materializacao.js';
import { separarContingencia } from '../src/shared/orcamento.js';
import type { Template } from '../src/shared/templates.js';
import T01json from '../data/templates/T01.json' with { type: 'json' };
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const T01 = T01json as Template;
// Rubricas que viram linhas do orçamento: todas menos a "Contingência (10%)", que passa a percentagem (decisão 019).
const RUBRICAS_T01 = separarContingencia(T01.rubricas).rubricas;
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

const emDias = (dias: number) => somarDias(hojeEmLuanda(), dias);

// Conta registada e com o e-mail confirmado (o registo já envia a ligação).
async function contaConfirmada(email = 'ana@exemplo.ao', nome = 'Ana Domingos') {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return cookie;
}

const criar = (cookie: string | undefined, extra: Record<string, unknown> = {}) =>
  c.post('/api/projectos', { template: 'T01', nome: 'Lançamento do relatório anual', dataEvento: emDias(30), local: 'Hotel Epic Sana, Luanda', ...extra }, cookie);

async function mudarPlano(email: string, plano: string) {
  await base.pool.query(
    `update workspaces set plan_code = $2 where id in
       (select wm.workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.email = $1)`,
    [email, plano],
  );
}

const contar = async (tabela: 'projects' | 'tasks' | 'budget_items') =>
  (await base.pool.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)).rows[0]!.n;

describe('templates disponíveis', () => {
  it('exige sessão', async () => {
    expect((await c.get('/api/templates')).statusCode).toBe(401);
  });

  it('só o T01 está disponível, com os números do template', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await c.get('/api/templates', cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([expect.objectContaining({ codigo: 'T01', nome: 'Conferência de Imprensa', tarefas: 47, criticas: 20, diasNecessarios: 21 })]);
  });
});

describe('previsão antes de criar', () => {
  const prever = (cookie: string | undefined, dataEvento: string, template = 'T01') => c.post('/api/projectos/previsao', { template, dataEvento }, cookie);

  it('exige sessão', async () => {
    expect((await prever(undefined, emDias(30))).statusCode).toBe(401);
  });

  it('com tempo suficiente, sem avisos', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await prever(cookie, emDias(21));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ diasDisponiveis: 21, diasNecessarios: 21, comprimido: false, avisos: [] });
  });

  it('com 10 dias, lista as tarefas críticas sem tempo', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await prever(cookie, emDias(10));
    const esperadas = T01.tarefas.filter((t) => t.critica && t.inicio < -10);
    expect(r.json().comprimido).toBe(true);
    expect(r.json().avisos.map((a: { id: string }) => a.id)).toEqual(esperadas.map((t) => t.id));
    expect(r.json().avisos[0]).toEqual({
      id: esperadas[0]!.id,
      titulo: esperadas[0]!.titulo,
      inicio: emDias(10 + esperadas[0]!.inicio),
      fim: emDias(10 + esperadas[0]!.fim),
      diasEmFalta: -10 - esperadas[0]!.inicio,
    });
  });

  it('evento hoje é aceite; ontem não', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await prever(cookie, emDias(0))).statusCode).toBe(200);
    const ontem = await prever(cookie, emDias(-1));
    expect(ontem.statusCode).toBe(400);
    expect(ontem.json().campos.dataEvento).toMatch(/já passou/);
  });

  it('recusa datas inválidas, demasiado longe e templates não disponíveis', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await prever(cookie, '2026-02-30')).json().campos.dataEvento).toBeDefined();
    expect((await prever(cookie, '30/11/2026')).json().campos.dataEvento).toBeDefined();
    expect((await prever(cookie, emDias(5 * 365 + 1))).json().campos.dataEvento).toMatch(/demasiado longe/);
    expect((await prever(cookie, emDias(5 * 365))).statusCode).toBe(200);
    // T02 já existe nos dados, mas ainda não está disponível.
    for (const template of ['T02', 'T99', '../T01', '']) {
      const r = await prever(cookie, emDias(30), template);
      expect(r.statusCode, template).toBe(400);
      expect(r.json().campos.template).toBeDefined();
    }
  });
});

describe('criar projecto', () => {
  it('exige sessão', async () => {
    expect((await criar(undefined)).statusCode).toBe(401);
    expect(await contar('projects')).toBe(0);
  });

  it('exige o e-mail confirmado', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await criar(cookie);
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toMatch(/Confirme o seu e-mail/);
    expect(await contar('projects')).toBe(0);
  });

  it('cria o projecto com as 47 tarefas do T01 nas datas certas e as rubricas a zero', async () => {
    const cookie = await contaConfirmada();
    const r = await criar(cookie);
    expect(r.statusCode).toBe(201);
    expect(r.json().avisos).toEqual([]);

    const p = await c.get(`/api/projectos/${r.json().id}`, cookie);
    expect(p.statusCode).toBe(200);
    const projecto = p.json();
    expect(projecto).toMatchObject({
      nome: 'Lançamento do relatório anual',
      template: 'T01',
      nomeTemplate: 'Conferência de Imprensa',
      versaoTemplate: T01.versao,
      dataEvento: emDias(30),
      local: 'Hotel Epic Sana, Luanda',
      estado: 'active',
      tarefas: 47,
      concluidas: 0,
    });
    const esperado = materializar(T01.tarefas, emDias(30), hojeEmLuanda());
    expect(projecto.tarefasDoProjecto).toHaveLength(47);
    projecto.tarefasDoProjecto.forEach((t: Record<string, unknown>, i: number) => {
      const original = T01.tarefas[i]!;
      expect(t).toMatchObject({
        idTemplate: original.id,
        fase: original.fase,
        categoria: original.categoria,
        titulo: original.titulo,
        papel: original.papel,
        critica: original.critica,
        nota: original.nota,
        inicio: esperado.tarefas[i]!.inicio,
        fim: esperado.tarefas[i]!.fim,
        comprimida: false,
        estado: 'pending',
      });
    });
    expect(projecto.tarefasDoProjecto.filter((t: { critica: boolean }) => t.critica)).toHaveLength(20);
    expect(projecto.orcamento).toHaveLength(RUBRICAS_T01.length);
    for (const [i, item] of projecto.orcamento.entries()) {
      expect(item).toMatchObject({ descricao: RUBRICAS_T01[i]!.descricao, obrigatoria: RUBRICAS_T01[i]!.obrigatoria, previstoCentimos: 0, realCentimos: 0 });
    }
    expect(projecto.contingencia).toBe(10);
  });

  it('as datas guardadas não mudam de dia com o fuso horário do servidor', async () => {
    const cookie = await contaConfirmada();
    const data = emDias(200);
    const { id } = (await criar(cookie, { dataEvento: data })).json();
    // Com o fuso da sessão da base de dados bem longe de Luanda, as datas continuam a ser o mesmo texto:
    // nunca passam por um instante (Date) que pudesse mudar de dia.
    const cliente = await base.pool.connect();
    try {
      await cliente.query("set time zone 'Pacific/Kiritimati'");
      const { rows } = await cliente.query('select event_date, (select min(start_date) from tasks where project_id = $1) as inicio from projects where id = $1', [id]);
      expect(rows[0].event_date).toBe(data);
      expect(rows[0].inicio).toBe(somarDias(data, -21));
    } finally {
      await cliente.query('reset time zone');
      cliente.release();
    }
    expect((await c.get(`/api/projectos/${id}`, cookie)).json().dataEvento).toBe(data);
  });

  it('com tarefas críticas sem tempo, só cria depois de a pessoa aceitar os avisos', async () => {
    const cookie = await contaConfirmada();
    const sem = await criar(cookie, { dataEvento: emDias(5) });
    expect(sem.statusCode).toBe(409);
    expect(sem.json().avisos.length).toBeGreaterThan(0);
    expect(await contar('projects')).toBe(0);

    const com = await criar(cookie, { dataEvento: emDias(5), aceitarAvisos: true });
    expect(com.statusCode).toBe(201);
    expect(com.json().avisos).toEqual(sem.json().avisos);
    const projecto = (await c.get(`/api/projectos/${com.json().id}`, cookie)).json();
    // Críticas mantêm o offset (mesmo no passado); não críticas comprimidas para caber.
    for (const [i, t] of projecto.tarefasDoProjecto.entries()) {
      const original = T01.tarefas[i]!;
      if (original.critica) expect(t.inicio).toBe(emDias(5 + original.inicio));
      else expect(t.inicio >= hojeEmLuanda()).toBe(true);
    }
  });

  it('valida os campos', async () => {
    const cookie = await contaConfirmada();
    expect((await criar(cookie, { nome: '   ' })).json().campos.nome).toBeDefined();
    expect((await criar(cookie, { nome: 'a'.repeat(121) })).json().campos.nome).toBeDefined();
    expect((await criar(cookie, { nome: 'Linha\nnova' })).json().campos.nome).toBeDefined();
    expect((await criar(cookie, { local: 'x'.repeat(201) })).json().campos.local).toBeDefined();
    expect((await criar(cookie, { dataEvento: emDias(-1) })).json().campos.dataEvento).toBeDefined();
    expect((await criar(cookie, { template: 'T02' })).json().campos.template).toBeDefined();
    expect(await contar('projects')).toBe(0);
  });

  it('local vazio fica por indicar; o nome é guardado tal como escrito (o ecrã é que o escapa)', async () => {
    const cookie = await contaConfirmada();
    await mudarPlano('ana@exemplo.ao', 'empresarial');
    const nome = '<script>alert(1)</script> & "Gala"';
    const { id } = (await criar(cookie, { nome, local: '' })).json();
    expect((await c.get(`/api/projectos/${id}`, cookie)).json()).toMatchObject({ nome, local: null });
  });

  it('ignora campos a mais no pedido (ex.: tentar criar no espaço de outra pessoa)', async () => {
    const outra = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const espacoDaOutra = (await c.eu(outra)).json().espaco.id;
    const cookie = await contaConfirmada();
    const r = await criar(cookie, { workspaceId: espacoDaOutra, espacoId: espacoDaOutra, workspace_id: espacoDaOutra });
    expect(r.statusCode).toBe(201);
    const { rows } = await base.pool.query('select workspace_id from projects where id = $1', [r.json().id]);
    expect(rows[0].workspace_id).toBe((await c.eu(cookie)).json().espaco.id);
    expect((await c.get('/api/projectos', outra)).json()).toEqual([]);
  });
});

describe('limite de projectos do plano', () => {
  it('Singular: um projecto; o segundo é recusado', async () => {
    const cookie = await contaConfirmada();
    expect((await criar(cookie)).statusCode).toBe(201);
    const segundo = await criar(cookie, { nome: 'Segundo' });
    expect(segundo.statusCode).toBe(403);
    expect(segundo.json().mensagem).toMatch(/plano Singular permite 1 projecto/);
    expect(await contar('projects')).toBe(1);
  });

  it('os arquivados continuam a contar', async () => {
    const cookie = await contaConfirmada();
    await criar(cookie);
    await base.pool.query("update projects set status = 'archived', archived_at = now()");
    expect((await criar(cookie, { nome: 'Segundo' })).statusCode).toBe(403);
  });

  it('pedidos em simultâneo não passam o limite', async () => {
    const cookie = await contaConfirmada();
    const respostas = await Promise.all(Array.from({ length: 20 }, (_, i) => criar(cookie, { nome: `Projecto ${i}` })));
    expect(respostas.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(respostas.filter((r) => r.statusCode === 403)).toHaveLength(19);
    expect(await contar('projects')).toBe(1);
    expect(await contar('tasks')).toBe(47);
  });

  it('um pedido recusado por avisos não gasta o projecto do plano', async () => {
    const cookie = await contaConfirmada();
    expect((await criar(cookie, { dataEvento: emDias(3) })).statusCode).toBe(409);
    expect((await criar(cookie)).statusCode).toBe(201);
  });

  it('só contam os projectos desde o início do período do plano', async () => {
    const cookie = await contaConfirmada();
    await criar(cookie);
    // Novo período do plano (ex.: renovação): o projecto anterior deixa de contar.
    await base.pool.query("update projects set created_at = now() - interval '2 days'");
    await base.pool.query("update workspaces set plan_started_at = now() - interval '1 day'");
    expect((await criar(cookie, { nome: 'Do novo período' })).statusCode).toBe(201);
    expect((await criar(cookie, { nome: 'Terceiro' })).statusCode).toBe(403);
  });

  it('Empresarial: sem limite de projectos', async () => {
    const cookie = await contaConfirmada();
    await mudarPlano('ana@exemplo.ao', 'empresarial');
    for (let i = 0; i < 3; i++) expect((await criar(cookie, { nome: `Projecto ${i}` })).statusCode).toBe(201);
  });

  it('há um travão de pedidos mesmo nos planos ilimitados', async () => {
    const cookie = await contaConfirmada();
    await mudarPlano('ana@exemplo.ao', 'grandes');
    await base.pool.query("insert into rate_limits (key, count, window_start) select 'criar-projecto:' || id, 30, now() from users");
    expect((await criar(cookie)).statusCode).toBe(429);
  });
});

describe('acesso aos projectos', () => {
  it('a lista só mostra os projectos dos espaços da pessoa', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    await criar(ana, { nome: 'Da Ana' });
    await criar(bruno, { nome: 'Do Bruno' });
    expect((await c.get('/api/projectos', ana)).json().map((p: { nome: string }) => p.nome)).toEqual(['Da Ana']);
    expect((await c.get('/api/projectos', bruno)).json().map((p: { nome: string }) => p.nome)).toEqual(['Do Bruno']);
    expect((await c.get('/api/projectos')).statusCode).toBe(401);
  });

  it('outra pessoa não consegue abrir o projecto: 404, igual a um projecto que não existe', async () => {
    const ana = await contaConfirmada();
    const { id } = (await criar(ana)).json();
    const bruno = cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno Neto'));
    const alheio = await c.get(`/api/projectos/${id}`, bruno);
    const inexistente = await c.get('/api/projectos/00000000-0000-4000-8000-000000000000', bruno);
    expect(alheio.statusCode).toBe(404);
    expect(alheio.json()).toEqual(inexistente.json());
    expect(alheio.body).not.toContain('Lançamento');
    expect((await c.get(`/api/projectos/${id}`)).statusCode).toBe(401);
  });

  it('IDs mal formados dão 404 e não chegam à base de dados como texto', async () => {
    const ana = await contaConfirmada();
    for (const id of ["1' or '1'='1", 'abc', '%00', '00000000-0000-4000-8000-00000000000g']) {
      expect((await c.get(`/api/projectos/${encodeURIComponent(id)}`, ana)).statusCode, id).toBe(404);
    }
  });

  it('só o dono do espaço cria projectos (um membro sem espaço próprio não cria no espaço de outra pessoa)', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    // Situação da Fase 4: o Bruno passa a membro do espaço da Ana e deixa de ter espaço próprio.
    const espacoAna = (await c.eu(ana)).json().espaco.id;
    await base.pool.query("delete from workspaces where id = (select workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.email = 'bruno@exemplo.ao')");
    await base.pool.query("insert into workspace_members (workspace_id, user_id, role) select $1, id, 'member' from users where email = 'bruno@exemplo.ao'", [espacoAna]);
    const r = await criar(bruno);
    expect(r.statusCode).toBe(403);
    expect(await contar('projects')).toBe(0);
  });

  it('a previsão tem limite de pedidos', async () => {
    const ana = await contaConfirmada();
    await base.pool.query("insert into rate_limits (key, count, window_start) select 'prever-projecto:' || id, 300, now() from users");
    expect((await c.post('/api/projectos/previsao', { template: 'T01', dataEvento: emDias(30) }, ana)).statusCode).toBe(429);
  });

  it('criar exige um pedido vindo do próprio Eveni (protecção CSRF)', async () => {
    const ana = await contaConfirmada();
    const r = await c.app.inject({
      method: 'POST',
      url: '/api/projectos',
      payload: { template: 'T01', nome: 'X', dataEvento: emDias(30) },
      headers: { cookie: ana, origin: 'https://site-malicioso.example' },
    });
    expect(r.statusCode).toBe(403);
    expect(await contar('projects')).toBe(0);
  });
});

describe('projectos na exportação e na eliminação da conta', () => {
  it('a exportação inclui os projectos com tarefas e orçamento', async () => {
    const cookie = await contaConfirmada();
    await criar(cookie);
    const dados = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, cookie)).json();
    expect(dados.projectos).toHaveLength(1);
    expect(dados.projectos[0].tarefasDoProjecto).toHaveLength(47);
    expect(dados.projectos[0].orcamento).toHaveLength(RUBRICAS_T01.length);
  });

  it('eliminar a conta apaga os projectos, as tarefas e o orçamento', async () => {
    const cookie = await contaConfirmada();
    await criar(cookie);
    const r = await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, cookie);
    expect(r.statusCode).toBe(204);
    expect([await contar('projects'), await contar('tasks'), await contar('budget_items')]).toEqual([0, 0, 0]);
  });
});
