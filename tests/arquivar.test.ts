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

async function contaConfirmada(email = 'ana@exemplo.ao', nome = 'Ana Domingos') {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return { cookie, id: (await c.eu(cookie)).json().id as string };
}

async function criarProjecto(cookie: string, nome = 'Conferência') {
  const r = await c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie);
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

const accoes = async () => (await base.pool.query<{ action: string }>("select action from audit_log where action like 'projecto.%' order by id")).rows.map((r) => r.action);

describe('arquivar e restaurar', () => {
  it('arquivar torna o projecto só de leitura; restaurar volta a permitir alterações', async () => {
    const { cookie } = await contaConfirmada();
    const id = await criarProjecto(cookie);

    const arquivar = await c.post(`/api/projectos/${id}/arquivar`, {}, cookie);
    expect(arquivar.statusCode).toBe(200);
    expect(arquivar.json()).toMatchObject({ id, estado: 'archived' });
    const { rows } = await base.pool.query('select archived_at from projects where id = $1', [id]);
    expect(rows[0].archived_at).not.toBeNull();

    const projecto = (await c.get(`/api/projectos/${id}`, cookie)).json();
    expect(projecto.estado).toBe('archived');
    const tarefa = projecto.tarefasDoProjecto[0].id;
    expect((await c.post(`/api/projectos/${id}/tarefas/${tarefa}`, { estado: 'done' }, cookie)).statusCode).toBe(409);

    const restaurar = await c.post(`/api/projectos/${id}/restaurar`, {}, cookie);
    expect(restaurar.json()).toMatchObject({ id, estado: 'active' });
    expect((await base.pool.query('select archived_at from projects where id = $1', [id])).rows[0].archived_at).toBeNull();
    expect((await c.post(`/api/projectos/${id}/tarefas/${tarefa}`, { estado: 'done' }, cookie)).statusCode).toBe(200);

    expect(await accoes()).toEqual(['projecto.criado', 'projecto.arquivado', 'projecto.restaurado']);
  });

  it('repetir o pedido não muda nada nem duplica a auditoria', async () => {
    const { cookie } = await contaConfirmada();
    const id = await criarProjecto(cookie);
    await c.post(`/api/projectos/${id}/arquivar`, {}, cookie);
    const { rows: antes } = await base.pool.query('select archived_at from projects where id = $1', [id]);
    expect((await c.post(`/api/projectos/${id}/arquivar`, {}, cookie)).json().estado).toBe('archived');
    const { rows: depois } = await base.pool.query('select archived_at from projects where id = $1', [id]);
    expect(depois[0].archived_at).toEqual(antes[0].archived_at);
    expect((await c.post(`/api/projectos/${id}/restaurar`, {}, cookie)).statusCode).toBe(200);
    expect((await c.post(`/api/projectos/${id}/restaurar`, {}, cookie)).json().estado).toBe('active');
    expect(await accoes()).toEqual(['projecto.criado', 'projecto.arquivado', 'projecto.restaurado']);
  });

  it('o arquivado continua a contar para o limite do plano Singular, mesmo depois de restaurado', async () => {
    const { cookie } = await contaConfirmada();
    const id = await criarProjecto(cookie);
    await c.post(`/api/projectos/${id}/arquivar`, {}, cookie);
    const segundo = await c.post('/api/projectos', { template: 'T01', nome: 'Outro', dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie);
    expect(segundo.statusCode).toBe(403);
    expect((await c.post(`/api/projectos/${id}/restaurar`, {}, cookie)).statusCode).toBe(200);
  });

  it('a lista mostra os arquivados depois dos activos', async () => {
    const { cookie } = await contaConfirmada();
    await base.pool.query("update workspaces set plan_code = 'empresarial'");
    const a = await criarProjecto(cookie, 'A arquivar');
    await criarProjecto(cookie, 'Activo');
    await c.post(`/api/projectos/${a}/arquivar`, {}, cookie);
    const lista = (await c.get('/api/projectos', cookie)).json();
    expect(lista.map((p: { nome: string; estado: string }) => [p.nome, p.estado])).toEqual([
      ['Activo', 'active'],
      ['A arquivar', 'archived'],
    ]);
  });
});

describe('acesso indevido', () => {
  it('outra pessoa não arquiva nem restaura: 404, sem alterações', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const id = await criarProjecto(ana.cookie);
    expect((await c.post(`/api/projectos/${id}/arquivar`, {}, bruno.cookie)).statusCode).toBe(404);
    await c.post(`/api/projectos/${id}/arquivar`, {}, ana.cookie);
    expect((await c.post(`/api/projectos/${id}/restaurar`, {}, bruno.cookie)).statusCode).toBe(404);
    expect((await base.pool.query('select status from projects where id = $1', [id])).rows[0].status).toBe('archived');
  });

  it('um membro que não é dono do espaço não arquiva: 403', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const id = await criarProjecto(ana.cookie);
    // Situação da Fase 4: o Bruno é membro (não dono) do espaço da Ana.
    await base.pool.query(
      `insert into workspace_members (workspace_id, user_id, role)
       select workspace_id, $1, 'member' from projects where id = $2`,
      [bruno.id, id],
    );
    const r = await c.post(`/api/projectos/${id}/arquivar`, {}, bruno.cookie);
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toMatch(/Só o dono/);
    expect((await base.pool.query('select status from projects where id = $1', [id])).rows[0].status).toBe('active');

    // Nem restaurar; e o ecrã só mostra o botão ao dono.
    await c.post(`/api/projectos/${id}/arquivar`, {}, ana.cookie);
    expect((await c.post(`/api/projectos/${id}/restaurar`, {}, bruno.cookie)).statusCode).toBe(403);
    expect((await base.pool.query('select status from projects where id = $1', [id])).rows[0].status).toBe('archived');
    expect((await c.get(`/api/projectos/${id}`, bruno.cookie)).json().podeArquivar).toBe(false);
    expect((await c.get(`/api/projectos/${id}`, ana.cookie)).json().podeArquivar).toBe(true);
  });

  it('arquivar e alterar tarefas ao mesmo tempo: nenhuma alteração entra depois de arquivado', async () => {
    const { cookie } = await contaConfirmada();
    const id = await criarProjecto(cookie);
    const tarefas: { id: string }[] = (await c.get(`/api/projectos/${id}`, cookie)).json().tarefasDoProjecto;
    const pedidos = [
      ...tarefas.slice(0, 15).map((t) => c.post(`/api/projectos/${id}/tarefas/${t.id}`, { estado: 'done' }, cookie)),
      c.post(`/api/projectos/${id}/arquivar`, {}, cookie),
    ];
    const respostas = await Promise.all(pedidos);
    expect(respostas.at(-1)!.statusCode).toBe(200);
    const aceites = respostas.slice(0, -1).filter((r) => r.statusCode === 200).length;
    const recusadas = respostas.slice(0, -1).filter((r) => r.statusCode === 409).length;
    expect(aceites + recusadas).toBe(15);
    // Todas as alterações aceites ficaram antes do arquivo; nenhuma depois.
    const { rows } = await base.pool.query(
      `select count(*)::int as n, count(*) filter (where t.updated_at > p.archived_at)::int as depois
         from tasks t join projects p on p.id = t.project_id where p.id = $1 and t.status = 'done'`,
      [id],
    );
    expect(rows[0]).toEqual({ n: aceites, depois: 0 });
  });

  it('sem sessão: 401; e-mail por confirmar: 403; ID mal formado: 404; pedido de outro site: 403', async () => {
    const { cookie, id: utilizador } = await contaConfirmada();
    const id = await criarProjecto(cookie);
    expect((await c.post(`/api/projectos/${id}/arquivar`, {})).statusCode).toBe(401);
    expect((await c.post('/api/projectos/abc/arquivar', {}, cookie)).statusCode).toBe(404);
    const outroSite = await c.app.inject({
      method: 'POST',
      url: `/api/projectos/${id}/arquivar`,
      payload: {},
      headers: { cookie, origin: 'https://site-malicioso.example' },
    });
    expect(outroSite.statusCode).toBe(403);
    await base.pool.query('update users set email_verified_at = null where id = $1', [utilizador]);
    expect((await c.post(`/api/projectos/${id}/arquivar`, {}, cookie)).statusCode).toBe(403);
    expect((await base.pool.query('select status from projects where id = $1', [id])).rows[0].status).toBe('active');
  });
});
