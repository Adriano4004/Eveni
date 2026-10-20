// Dar, mudar e retirar acessos de membros da equipa a um projecto (decisão 017).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
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

// A Ana (Empresarial) tem um projecto; o Bruno e a Carla entraram na equipa por convite; o Daniel é de fora.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (
    await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie)
  ).json().id;
  const equipa = [];
  for (const [email, nome] of [
    ['bruno@exemplo.ao', 'Bruno Neto'],
    ['carla@exemplo.ao', 'Carla Lima'],
  ] as const) {
    const pessoa = await contaConfirmada(email, nome);
    const ligacao: string = (await c.post('/api/equipa/convites', { email }, ana.cookie)).json().ligacao;
    const token = decodeURIComponent(new URL(ligacao).searchParams.get('token')!);
    expect((await c.post('/api/convites/aceitar', { token }, pessoa.cookie)).statusCode).toBe(200);
    equipa.push(pessoa);
  }
  const daniel = await contaConfirmada('daniel@exemplo.ao', 'Daniel Costa');
  const [bruno, carla] = equipa as [Awaited<ReturnType<typeof contaConfirmada>>, Awaited<ReturnType<typeof contaConfirmada>>];
  return { ana, bruno, carla, daniel, projecto };
}

const dar = (cookie: string, projecto: string, utilizadorId: string, papel: string) =>
  c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId, papel }, cookie);
const retirar = (cookie: string, projecto: string, utilizador: string) => c.post(`/api/projectos/${projecto}/acessos/${utilizador}/remover`, {}, cookie);

describe('o dono dá e retira acessos', () => {
  it('dar acesso de editor: a pessoa passa a ver e a alterar o projecto', async () => {
    const { ana, bruno, projecto } = await cenario();
    const antes = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json();
    expect(antes.semAcesso.map((p: { nome: string }) => p.nome)).toEqual(['Bruno Neto', 'Carla Lima']);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);

    expect((await dar(ana.cookie, projecto, bruno.id, 'editor')).statusCode).toBe(204);
    const depois = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json();
    expect(depois.semAcesso.map((p: { nome: string }) => p.nome)).toEqual(['Carla Lima']);
    expect(depois.membros).toContainEqual({ id: bruno.id, nome: 'Bruno Neto', papel: 'editor' });
    const doBruno = (await c.get(`/api/projectos/${projecto}`, bruno.cookie)).json();
    expect(doBruno).toMatchObject({ papel: 'editor', semAcesso: [] });
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${doBruno.tarefasDoProjecto[0].id}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(200);
  });

  it('passar a leitor: deixa de alterar e as tarefas dele ficam sem responsável', async () => {
    const { ana, bruno, projecto } = await cenario();
    await dar(ana.cookie, projecto, bruno.id, 'editor');
    const tarefa = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().tarefasDoProjecto[0].id;
    await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie);

    expect((await dar(ana.cookie, projecto, bruno.id, 'viewer')).statusCode).toBe(204);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(403);
    expect((await base.pool.query('select assignee_id from tasks where id = $1', [tarefa])).rows[0].assignee_id).toBeNull();
    expect((await base.pool.query('select count(*)::int as n from project_members')).rows[0].n).toBe(1);
  });

  it('retirar o acesso: deixa de ver o projecto e as tarefas dele ficam sem responsável', async () => {
    const { ana, bruno, projecto } = await cenario();
    await dar(ana.cookie, projecto, bruno.id, 'editor');
    const tarefa = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().tarefasDoProjecto[0].id;
    await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie);

    expect((await retirar(ana.cookie, projecto, bruno.id)).statusCode).toBe(204);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
    expect((await base.pool.query('select assignee_id from tasks where id = $1', [tarefa])).rows[0].assignee_id).toBeNull();
    // Continua na equipa: pode voltar a receber acesso.
    expect((await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().semAcesso.map((p: { nome: string }) => p.nome)).toContain('Bruno Neto');
    const accoes = (await base.pool.query<{ action: string }>("select action from audit_log where action like 'projecto.acesso%' order by id")).rows;
    expect(accoes.map((a) => a.action)).toEqual(['projecto.acesso_dado', 'projecto.acesso_retirado']);
  });

  it('também num projecto arquivado (por exemplo, retirar acessos depois do evento)', async () => {
    const { ana, bruno, projecto } = await cenario();
    await dar(ana.cookie, projecto, bruno.id, 'viewer');
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await retirar(ana.cookie, projecto, bruno.id)).statusCode).toBe(204);
  });
});

describe('IDs no pedido verificados no servidor', () => {
  it('só se dá acesso a membros (não donos) da equipa deste espaço', async () => {
    const { ana, daniel, projecto } = await cenario();
    for (const utilizadorId of [daniel.id, ana.id, '00000000-0000-4000-8000-000000000000']) {
      const r = await dar(ana.cookie, projecto, utilizadorId, 'editor');
      expect(r.statusCode, utilizadorId).toBe(400);
      expect(r.json().campos.utilizadorId).toBeDefined();
    }
    expect((await base.pool.query('select count(*)::int as n from project_members')).rows[0].n).toBe(0);
  });

  it('um membro de outro espaço (mesmo que dono lá) não recebe acesso', async () => {
    const { ana, projecto } = await cenario();
    const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
    await base.pool.query("update workspaces set plan_code = 'empresarial' where name = 'Espaço de Eva Pinto'");
    expect((await dar(ana.cookie, projecto, eva.id, 'viewer')).statusCode).toBe(400);
  });

  it('o papel só pode ser editor ou leitor', async () => {
    const { ana, bruno, projecto } = await cenario();
    for (const papel of ['owner', 'admin', '', 'EDITOR']) {
      expect((await dar(ana.cookie, projecto, bruno.id, papel)).statusCode, papel).toBe(400);
    }
  });
});

describe('quem não é dono não gere acessos', () => {
  it('editor e leitor: 403; membro sem acesso e alguém de fora: 404', async () => {
    const { ana, bruno, carla, daniel, projecto } = await cenario();
    await dar(ana.cookie, projecto, bruno.id, 'editor');
    await dar(ana.cookie, projecto, carla.id, 'viewer');
    // O editor tenta dar-se mais acesso ou retirar a leitora.
    expect((await dar(bruno.cookie, projecto, carla.id, 'editor')).statusCode).toBe(403);
    expect((await retirar(bruno.cookie, projecto, carla.id)).statusCode).toBe(403);
    expect((await dar(carla.cookie, projecto, carla.id, 'editor')).statusCode).toBe(403);
    expect((await dar(daniel.cookie, projecto, daniel.id, 'editor')).statusCode).toBe(404);
    expect((await retirar(daniel.cookie, projecto, bruno.id)).statusCode).toBe(404);
    // Nada mudou.
    const papeis = (await base.pool.query('select user_id, role from project_members order by role')).rows;
    expect(papeis).toEqual([
      { user_id: bruno.id, role: 'editor' },
      { user_id: carla.id, role: 'viewer' },
    ]);
  });

  it('a lista de quem não tem acesso só vai para o dono', async () => {
    const { ana, bruno, projecto } = await cenario();
    await dar(ana.cookie, projecto, bruno.id, 'editor');
    const r = await c.get(`/api/projectos/${projecto}`, bruno.cookie);
    expect(r.json().semAcesso).toEqual([]);
    expect(r.body).not.toContain('Carla Lima');
  });

  it('retirar um acesso que não existe ou com IDs mal formados: 404', async () => {
    const { ana, carla, projecto } = await cenario();
    expect((await retirar(ana.cookie, projecto, carla.id)).statusCode).toBe(404);
    expect((await retirar(ana.cookie, projecto, 'abc')).statusCode).toBe(404);
    expect((await c.post('/api/projectos/abc/acessos', { utilizadorId: carla.id, papel: 'editor' }, ana.cookie)).statusCode).toBe(404);
  });

  it('sem sessão: 401', async () => {
    const { bruno, projecto } = await cenario();
    expect((await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: bruno.id, papel: 'editor' })).statusCode).toBe(401);
  });
});
