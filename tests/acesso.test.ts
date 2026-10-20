// Regra de acesso aos projectos (decisão 017): o dono do espaço vê todos os projectos do espaço; os outros
// membros só vêem os projectos a que foram adicionados, como editores ou leitores.
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

// A Ana (dona) tem um projecto; o Bruno e a Carla entram no espaço dela como membros.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
  const carla = await contaConfirmada('carla@exemplo.ao', 'Carla Lima');
  const r = await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie);
  const projecto: string = r.json().id;
  const { rows } = await base.pool.query<{ workspace_id: string }>('select workspace_id from projects where id = $1', [projecto]);
  for (const pessoa of [bruno, carla]) {
    await base.pool.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [rows[0]!.workspace_id, pessoa.id]);
  }
  const tarefa: string = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().tarefasDoProjecto[0].id;
  return { ana, bruno, carla, projecto, tarefa };
}

const adicionar = (projecto: string, utilizador: string, papel: 'editor' | 'viewer') =>
  base.pool.query('insert into project_members (project_id, user_id, role) values ($1, $2, $3)', [projecto, utilizador, papel]);

describe('membro do espaço sem acesso ao projecto', () => {
  it('não vê o projecto na lista, não o abre e não altera tarefas', async () => {
    const { bruno, projecto, tarefa } = await cenario();
    expect((await c.get('/api/projectos', bruno.cookie)).json()).toEqual([]);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/projectos/${projecto}/arquivar`, {}, bruno.cookie)).statusCode).toBe(404);
  });

  it('não pode ser escolhido como responsável, mesmo sendo do espaço', async () => {
    const { ana, bruno, projecto, tarefa } = await cenario();
    const r = await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.responsavelId).toBeDefined();
  });
});

describe('a pessoa tem de ser do espaço do projecto', () => {
  it('sair do espaço retira logo o acesso, mesmo que fique a linha em project_members', async () => {
    const { bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'editor');
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(200);
    await base.pool.query("delete from workspace_members where user_id = $1 and role = 'member'", [bruno.id]);
    expect((await c.get('/api/projectos', bruno.cookie)).json()).toEqual([]);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(404);
  });

  it('uma linha em project_members de alguém de fora do espaço não dá acesso nem aparece nos membros', async () => {
    const { ana, projecto } = await cenario();
    const daniel = await contaConfirmada('daniel@exemplo.ao', 'Daniel Costa');
    await adicionar(projecto, daniel.id, 'editor');
    expect((await c.get(`/api/projectos/${projecto}`, daniel.cookie)).statusCode).toBe(404);
    expect((await c.get('/api/projectos', daniel.cookie)).json()).toEqual([]);
    const nomes = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().membros.map((m: { nome: string }) => m.nome);
    expect(nomes).not.toContain('Daniel Costa');
  });
});

describe('leitor do projecto', () => {
  it('vê o projecto mas não altera nada', async () => {
    const { bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'viewer');
    expect((await c.get('/api/projectos', bruno.cookie)).json()).toEqual([expect.objectContaining({ id: projecto, papel: 'viewer' })]);
    const p = (await c.get(`/api/projectos/${projecto}`, bruno.cookie)).json();
    expect(p).toMatchObject({ papel: 'viewer', podeArquivar: false });

    const alterar = await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie);
    expect(alterar.statusCode).toBe(403);
    expect(alterar.json().mensagem).toMatch(/só para consulta/);
    expect((await base.pool.query('select status from tasks where id = $1', [tarefa])).rows[0].status).toBe('pending');
    expect((await c.post(`/api/projectos/${projecto}/arquivar`, {}, bruno.cookie)).statusCode).toBe(403);
    expect((await c.post(`/api/projectos/${projecto}/restaurar`, {}, bruno.cookie)).statusCode).toBe(403);
  });

  it('não pode ser escolhido como responsável (não conseguiria concluir a tarefa)', async () => {
    const { ana, bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'viewer');
    const r = await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.responsavelId).toBeDefined();
  });

  it('num projecto arquivado continua a não poder alterar', async () => {
    const { ana, bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'viewer');
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(403);
  });
});

describe('editor do projecto', () => {
  it('altera tarefas, pode ser responsável, mas não arquiva', async () => {
    const { ana, bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'editor');
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done', responsavelId: bruno.id }, bruno.cookie)).statusCode).toBe(200);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: ana.id }, bruno.cookie)).statusCode).toBe(200);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).json()).toMatchObject({ papel: 'editor', podeArquivar: false });
    expect((await c.get('/api/projectos', bruno.cookie)).json()).toEqual([expect.objectContaining({ id: projecto, papel: 'editor' })]);
    expect((await c.post(`/api/projectos/${projecto}/arquivar`, {}, bruno.cookie)).statusCode).toBe(403);
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await c.post(`/api/projectos/${projecto}/restaurar`, {}, bruno.cookie)).statusCode).toBe(403);
  });

  it('o responsável não pode ser alguém inexistente nem dono de outro espaço', async () => {
    const { ana, projecto, tarefa } = await cenario();
    const daniel = await contaConfirmada('daniel@exemplo.ao', 'Daniel Costa');
    for (const responsavelId of ['00000000-0000-4000-8000-000000000000', daniel.id]) {
      expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId }, ana.cookie)).statusCode).toBe(400);
    }
  });

  it('a lista de responsáveis tem só quem tem acesso ao projecto', async () => {
    const { ana, bruno, projecto } = await cenario();
    await adicionar(projecto, bruno.id, 'viewer');
    // A Carla é do espaço mas não deste projecto: não aparece.
    const membros = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().membros;
    expect(membros).toEqual([
      { id: ana.id, nome: 'Ana Domingos', papel: 'owner' },
      { id: bruno.id, nome: 'Bruno Neto', papel: 'viewer' },
    ]);
  });

  it('perde o acesso logo que é retirado do projecto', async () => {
    const { bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'editor');
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(200);
    await base.pool.query('delete from project_members where user_id = $1', [bruno.id]);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { estado: 'done' }, bruno.cookie)).statusCode).toBe(404);
  });
});

describe('dono do espaço', () => {
  it('é dono de todos os projectos do seu espaço, e de nenhum de outros espaços', async () => {
    const { ana, bruno, projecto } = await cenario();
    expect((await c.get(`/api/projectos/${projecto}`, ana.cookie)).json()).toMatchObject({ papel: 'owner', podeArquivar: true });
    // O Bruno é dono do seu próprio espaço, mas isso não lhe dá acesso ao projecto da Ana.
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
  });

  it('a regra na base de dados devolve o papel certo em cada caso', async () => {
    const { ana, bruno, carla, projecto } = await cenario();
    await adicionar(projecto, bruno.id, 'viewer');
    const papel = async (u: string) => (await base.pool.query('select papel_no_projecto($1, $2) as p', [projecto, u])).rows[0].p;
    expect(await papel(ana.id)).toBe('owner');
    expect(await papel(bruno.id)).toBe('viewer');
    expect(await papel(carla.id)).toBeNull();
    // Linha em project_members sem ser do espaço: sem acesso.
    const daniel = await contaConfirmada('daniel@exemplo.ao', 'Daniel Costa');
    await adicionar(projecto, daniel.id, 'editor');
    expect(await papel(daniel.id)).toBeNull();
    expect(await papel('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('dados da conta', () => {
  it('a exportação de um membro inclui os projectos de outros espaços a que tem acesso', async () => {
    const { bruno, projecto } = await cenario();
    await adicionar(projecto, bruno.id, 'editor');
    const dados = (await c.post('/api/conta/exportar', { palavraPasse: 'Kizomba-2026-evento' }, bruno.cookie)).json();
    expect(dados.acessosAProjectos).toEqual([
      { projectoId: projecto, projecto: 'Conferência', espaco: 'Espaço de Ana Domingos', papel: 'editor', desde: expect.any(String) },
    ]);
    // Os projectos da Ana não são do Bruno: não vêm por inteiro na exportação dele.
    expect(dados.projectos).toEqual([]);
  });

  it('eliminar a conta de um membro retira-lhe os acessos e as tarefas atribuídas', async () => {
    const { ana, bruno, projecto, tarefa } = await cenario();
    await adicionar(projecto, bruno.id, 'editor');
    await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie);
    await base.pool.query('delete from users where id = $1', [bruno.id]);
    expect((await base.pool.query('select count(*)::int as n from project_members')).rows[0].n).toBe(0);
    expect((await base.pool.query('select assignee_id from tasks where id = $1', [tarefa])).rows[0].assignee_id).toBeNull();
  });
});
