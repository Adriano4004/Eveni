import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import type { Projecto, TarefaProjecto } from '../src/shared/projectos.js';
import type { Template } from '../src/shared/templates.js';
import T01json from '../data/templates/T01.json' with { type: 'json' };
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente } from './cliente.js';

const T01 = T01json as Template;
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

async function contaConfirmada(email = 'ana@exemplo.ao', nome = 'Ana Domingos') {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  const id: string = (await c.eu(cookie)).json().id;
  return { cookie, id };
}

async function criarProjecto(cookie: string, dataEvento = emDias(30)): Promise<Projecto> {
  const r = await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento, aceitarAvisos: true }, cookie);
  expect(r.statusCode).toBe(201);
  return (await c.get(`/api/projectos/${r.json().id}`, cookie)).json();
}

const alterar = (cookie: string | undefined, projecto: string, tarefa: string, corpo: object) =>
  c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, corpo, cookie);

describe('estado das tarefas', () => {
  it('marcar como concluída, em curso e voltar a por fazer', async () => {
    const { cookie } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    const t = p.tarefasDoProjecto[0]!;
    expect(t).toMatchObject({ estado: 'pending', responsavel: null, concluidaEm: null, emAtraso: false });

    const feita = await alterar(cookie, p.id, t.id, { estado: 'done' });
    expect(feita.statusCode).toBe(200);
    expect(feita.json()).toMatchObject({ id: t.id, estado: 'done', titulo: t.titulo });
    const concluidaEm = feita.json().concluidaEm;
    expect(Date.now() - Date.parse(concluidaEm)).toBeLessThan(60_000);

    // Voltar a marcar como concluída não muda a data em que foi concluída.
    expect((await alterar(cookie, p.id, t.id, { estado: 'done' })).json().concluidaEm).toBe(concluidaEm);

    const projecto = (await c.get(`/api/projectos/${p.id}`, cookie)).json();
    expect(projecto.concluidas).toBe(1);

    expect((await alterar(cookie, p.id, t.id, { estado: 'in_progress' })).json()).toMatchObject({ estado: 'in_progress', concluidaEm: null });
    expect((await alterar(cookie, p.id, t.id, { estado: 'pending' })).json()).toMatchObject({ estado: 'pending', concluidaEm: null });
  });

  it('recusa estados inválidos e pedidos vazios', async () => {
    const { cookie } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    const t = p.tarefasDoProjecto[0]!;
    for (const corpo of [{ estado: 'feito' }, { estado: '' }, {}, { estado: null }]) {
      expect((await alterar(cookie, p.id, t.id, corpo)).statusCode, JSON.stringify(corpo)).toBe(400);
    }
  });
});

describe('responsável', () => {
  it('escolher um membro do espaço e voltar a ninguém', async () => {
    const { cookie, id } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    expect(p.membros).toEqual([{ id, nome: 'Ana Domingos', papel: 'owner' }]);
    const t = p.tarefasDoProjecto[3]!;

    const r = await alterar(cookie, p.id, t.id, { responsavelId: id });
    expect(r.statusCode).toBe(200);
    expect(r.json().responsavel).toEqual({ id, nome: 'Ana Domingos' });
    // Mudar só o estado não mexe no responsável.
    expect((await alterar(cookie, p.id, t.id, { estado: 'done' })).json().responsavel).toEqual({ id, nome: 'Ana Domingos' });
    expect((await alterar(cookie, p.id, t.id, { responsavelId: null })).json().responsavel).toBeNull();
  });

  it('estado e responsável no mesmo pedido', async () => {
    const { cookie, id } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    const r = await alterar(cookie, p.id, p.tarefasDoProjecto[1]!.id, { estado: 'in_progress', responsavelId: id });
    expect(r.json()).toMatchObject({ estado: 'in_progress', responsavel: { id, nome: 'Ana Domingos' } });
  });

  it('não aceita como responsável alguém de fora do espaço de trabalho (ID secundário no corpo)', async () => {
    const { cookie } = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const p = await criarProjecto(cookie);
    const t = p.tarefasDoProjecto[0]!;
    for (const responsavelId of [bruno.id, '00000000-0000-4000-8000-000000000000']) {
      const r = await alterar(cookie, p.id, t.id, { responsavelId });
      expect(r.statusCode).toBe(400);
      expect(r.json().campos.responsavelId).toBeDefined();
    }
    expect((await alterar(cookie, p.id, t.id, { responsavelId: 'bruno' })).statusCode).toBe(400);
    const { rows } = await base.pool.query('select assignee_id from tasks where id = $1', [t.id]);
    expect(rows[0].assignee_id).toBeNull();
  });

  it('a lista de membros só tem o nome: nunca o e-mail', async () => {
    const { cookie } = await contaConfirmada();
    const r = await c.get(`/api/projectos/${(await criarProjecto(cookie)).id}`, cookie);
    expect(r.body).not.toContain('ana@exemplo.ao');
  });

  it('quando a conta do responsável é eliminada, a tarefa fica sem responsável', async () => {
    const { cookie, id } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    await alterar(cookie, p.id, p.tarefasDoProjecto[0]!.id, { responsavelId: id });
    await base.pool.query('delete from users where id = $1', [id]);
    const { rows } = await base.pool.query('select count(*)::int as n from tasks where assignee_id is not null');
    expect(rows[0].n).toBe(0);
  });
});

describe('acesso indevido às tarefas', () => {
  it('outra pessoa não consegue alterar as tarefas do projecto: 404', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const p = await criarProjecto(ana.cookie);
    const t = p.tarefasDoProjecto[0]!;
    const r = await alterar(bruno.cookie, p.id, t.id, { estado: 'done', responsavelId: bruno.id });
    expect(r.statusCode).toBe(404);
    const { rows } = await base.pool.query('select status, assignee_id from tasks where id = $1', [t.id]);
    expect(rows[0]).toEqual({ status: 'pending', assignee_id: null });
  });

  it('uma tarefa de outro projecto não se altera através do meu projecto', async () => {
    const ana = await contaConfirmada();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const daAna = await criarProjecto(ana.cookie);
    const doBruno = await criarProjecto(bruno.cookie);
    // O Bruno usa o ID do seu projecto com o ID de uma tarefa da Ana.
    const r = await alterar(bruno.cookie, doBruno.id, daAna.tarefasDoProjecto[0]!.id, { estado: 'done' });
    expect(r.statusCode).toBe(404);
    expect((await c.get(`/api/projectos/${daAna.id}`, ana.cookie)).json().concluidas).toBe(0);
  });

  it('mesmo com acesso aos dois projectos, a tarefa tem de pertencer ao projecto do endereço', async () => {
    const { cookie } = await contaConfirmada();
    await base.pool.query("update workspaces set plan_code = 'empresarial'");
    const a = await criarProjecto(cookie);
    const b = await criarProjecto(cookie);
    expect((await alterar(cookie, b.id, a.tarefasDoProjecto[0]!.id, { estado: 'done' })).statusCode).toBe(404);
    expect((await c.get(`/api/projectos/${a.id}`, cookie)).json().concluidas).toBe(0);
  });

  it('sem sessão: 401; IDs mal formados: 404', async () => {
    const { cookie } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    const t = p.tarefasDoProjecto[0]!;
    expect((await alterar(undefined, p.id, t.id, { estado: 'done' })).statusCode).toBe(401);
    expect((await alterar(cookie, p.id, "1' or '1'='1", { estado: 'done' })).statusCode).toBe(404);
    expect((await alterar(cookie, 'abc', t.id, { estado: 'done' })).statusCode).toBe(404);
  });

  it('sem o e-mail confirmado, não altera', async () => {
    const { cookie, id } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    await base.pool.query('update users set email_verified_at = null where id = $1', [id]);
    const r = await alterar(cookie, p.id, p.tarefasDoProjecto[0]!.id, { estado: 'done' });
    expect(r.statusCode).toBe(403);
    const { rows } = await base.pool.query('select status from tasks where id = $1', [p.tarefasDoProjecto[0]!.id]);
    expect(rows[0].status).toBe('pending');
  });

  it('projecto arquivado: só leitura', async () => {
    const { cookie } = await contaConfirmada();
    const p = await criarProjecto(cookie);
    await base.pool.query("update projects set status = 'archived', archived_at = now() where id = $1", [p.id]);
    const r = await alterar(cookie, p.id, p.tarefasDoProjecto[0]!.id, { estado: 'done' });
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toMatch(/arquivado/);
  });
});

describe('tarefas críticas em atraso', () => {
  it('conta as críticas por concluir com o prazo antes de hoje, e deixa de contar quando ficam concluídas', async () => {
    const { cookie } = await contaConfirmada();
    // Evento daqui a 5 dias: as críticas de D-21 a D-6 ficaram com prazos no passado.
    const p = await criarProjecto(cookie, emDias(5));
    const hoje = hojeEmLuanda();
    expect(p.hoje).toBe(hoje);
    const esperadas = p.tarefasDoProjecto.filter((t) => t.critica && t.fim < hoje);
    expect(esperadas.length).toBeGreaterThan(0);
    expect(p.criticasEmAtraso).toBe(esperadas.length);
    for (const t of p.tarefasDoProjecto) expect(t.emAtraso, t.idTemplate).toBe(t.fim < hoje);

    const primeira = esperadas[0]!;
    const feita: TarefaProjecto = (await alterar(cookie, p.id, primeira.id, { estado: 'done' })).json();
    expect(feita.emAtraso).toBe(false);
    const lista = (await c.get('/api/projectos', cookie)).json();
    expect(lista[0].criticasEmAtraso).toBe(esperadas.length - 1);
  });

  it('com tempo suficiente, nada em atraso; uma tarefa que acaba hoje ainda não está em atraso', async () => {
    const { cookie } = await contaConfirmada();
    const p = await criarProjecto(cookie, emDias(21));
    expect(p.criticasEmAtraso).toBe(0);
    const deHoje = p.tarefasDoProjecto.filter((t) => t.fim === hojeEmLuanda());
    expect(deHoje.length).toBeGreaterThan(0);
    // Incluindo tarefas críticas (D-21 no T01): acabam hoje, ainda não estão em atraso.
    expect(deHoje.filter((t) => t.critica).length).toBe(T01.tarefas.filter((t) => t.critica && t.fim === -21).length);
    for (const t of deHoje) expect(t.emAtraso).toBe(false);
  });
});
