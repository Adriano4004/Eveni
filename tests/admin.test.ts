import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lerConfig } from '../src/server/config.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { envValido, limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente } from './cliente.js';

// Administração dos planos (decisão 027).
const ADMIN = 'adriano@eveni.ao';
const base = criarBaseDeDados(URL_BD_TESTE);
let c: Awaited<ReturnType<typeof criarCliente>>;

beforeAll(async () => {
  await aplicarMigracoes(base, 'drizzle');
});
beforeEach(async () => {
  await limparBaseDeDados(base.pool);
  c = await criarCliente(base, { ADMINS: [ADMIN] });
});
afterAll(async () => {
  await c.app.close();
  await base.fechar();
});

async function conta(email: string, nome: string) {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return cookie;
}

// A verificação em dois passos activa (directamente na base de dados: o fluxo tem os seus próprios testes).
const comDoisFactores = (email: string) => base.pool.query("update users set totp_enabled_at = now(), totp_secret = 'x' where email = $1", [email]);

async function administrador() {
  const cookie = await conta(ADMIN, 'Adriano');
  await comDoisFactores(ADMIN);
  return cookie;
}

const espacoDe = async (email: string) =>
  (
    await base.pool.query<{ id: string; plan_code: string; plan_started_at: Date }>(
      `select w.id, w.plan_code, w.plan_started_at from workspaces w join workspace_members wm on wm.workspace_id = w.id
         join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner'`,
      [email],
    )
  ).rows[0]!;

const mudar = (cookie: string | undefined, id: string, plano: unknown) => c.post(`/api/admin/espacos/${id}/plano`, { plano }, cookie);

describe('configuração', () => {
  it('ADMINS é uma lista de e-mails, em minúsculas; vazia por omissão', () => {
    expect(lerConfig(envValido).ADMINS).toEqual([]);
    expect(lerConfig({ ...envValido, ADMINS: ' Adriano@Eveni.ao , outra@exemplo.ao ' }).ADMINS).toEqual(['adriano@eveni.ao', 'outra@exemplo.ao']);
    expect(() => lerConfig({ ...envValido, ADMINS: 'adriano@eveni.ao, nao-e-email' })).toThrow(/ADMINS/);
  });
});

describe('quem pode entrar na administração', () => {
  it('sem sessão: 401', async () => {
    expect((await c.get('/api/admin/espacos')).statusCode).toBe(401);
    const { id } = await espacoDe((await conta('ana@exemplo.ao', 'Ana'), 'ana@exemplo.ao'));
    expect((await mudar(undefined, id, 'grandes')).statusCode).toBe(401);
  });

  it('um cliente comum (mesmo com dois passos) recebe 404 e não muda o próprio plano', async () => {
    const cookie = await conta('ana@exemplo.ao', 'Ana');
    await comDoisFactores('ana@exemplo.ao');
    const { id } = await espacoDe('ana@exemplo.ao');
    expect((await c.get('/api/admin/espacos', cookie)).statusCode).toBe(404);
    expect((await mudar(cookie, id, 'grandes')).statusCode).toBe(404);
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('singular');
    expect((await c.eu(cookie)).json().administrador).toBe(false);
  });

  it('o administrador sem a verificação em dois passos é recusado, com a explicação', async () => {
    const cookie = await conta(ADMIN, 'Adriano');
    expect((await c.eu(cookie)).json().administrador).toBe(true);
    const r = await c.get('/api/admin/espacos', cookie);
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toMatch(/active primeiro a verificação em dois passos/);
    const { id } = await espacoDe(ADMIN);
    expect((await mudar(cookie, id, 'grandes')).statusCode).toBe(403);
    expect((await espacoDe(ADMIN)).plan_code).toBe('singular');
  });

  it('o administrador com os termos por aceitar também é recusado', async () => {
    const cookie = await administrador();
    await base.pool.query('update users set terms_version = null, terms_accepted_at = null');
    expect((await c.get('/api/admin/espacos', cookie)).statusCode).toBe(403);
  });

  it('sem ADMINS configurado, ninguém é administrador', async () => {
    await c.app.close();
    c = await criarCliente(base);
    const cookie = await administrador();
    expect((await c.eu(cookie)).json().administrador).toBe(false);
    expect((await c.get('/api/admin/espacos', cookie)).statusCode).toBe(404);
  });
});

describe('lista de espaços', () => {
  it('mostra o dono, o plano, os projectos e os membros, e pesquisa por e-mail ou nome', async () => {
    const admin = await administrador();
    const ana = await conta('ana@exemplo.ao', 'Ana Domingos');
    await c.post('/api/projectos', { template: 'T01', nome: 'Lançamento', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana);
    await conta('bruno@exemplo.ao', 'Bruno');

    const todos = (await c.get('/api/admin/espacos', admin)).json();
    expect(todos).toHaveLength(3);
    expect(todos.find((e: { dono: { email: string } }) => e.dono.email === 'ana@exemplo.ao')).toMatchObject({
      nome: 'Espaço de Ana Domingos',
      dono: { nome: 'Ana Domingos', email: 'ana@exemplo.ao' },
      plano: 'singular',
      projectos: 1,
      membros: 1,
      acimaDoLimite: false,
    });

    const porEmail = (await c.get('/api/admin/espacos?pesquisa=ANA@exemplo', admin)).json();
    expect(porEmail.map((e: { dono: { email: string } }) => e.dono.email)).toEqual(['ana@exemplo.ao']);
    const porNome = (await c.get('/api/admin/espacos?pesquisa=de%20Bruno', admin)).json();
    expect(porNome.map((e: { nome: string }) => e.nome)).toEqual(['Espaço de Bruno']);
    // % e _ são texto, não curingas.
    expect((await c.get('/api/admin/espacos?pesquisa=%25', admin)).json()).toEqual([]);
    expect((await c.get('/api/admin/espacos?pesquisa=_', admin)).json()).toEqual([]);
    expect((await c.get(`/api/admin/espacos?pesquisa=${'x'.repeat(255)}`, admin)).statusCode).toBe(400);
  });

  it('as respostas não expõem segredos', async () => {
    const admin = await administrador();
    const corpo = (await c.get('/api/admin/espacos', admin)).body;
    expect(corpo).not.toMatch(/password|hash|totp|token|secret/i);
  });
});

describe('mudar o plano', () => {
  it('muda, recomeça a data do plano, regista na auditoria e avisa o dono por e-mail', async () => {
    const admin = await administrador();
    await conta('ana@exemplo.ao', 'Ana');
    const antes = await espacoDe('ana@exemplo.ao');
    await new Promise((r) => setTimeout(r, 20));
    const emails = c.emails.length;

    const r = await mudar(admin, antes.id, 'empresarial');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ plano: 'empresarial', mudou: true, projectos: 0, membros: 1, acimaDoLimite: false });
    const depois = await espacoDe('ana@exemplo.ao');
    expect(depois.plan_code).toBe('empresarial');
    expect(depois.plan_started_at.getTime()).toBeGreaterThan(antes.plan_started_at.getTime());

    const { rows } = await base.pool.query(
      "select a.details, a.workspace_id, u.email from audit_log a join users u on u.id = a.user_id where a.action = 'admin.plano_alterado'",
    );
    expect(rows).toEqual([{ details: { de: 'singular', para: 'empresarial' }, workspace_id: antes.id, email: ADMIN }]);

    expect(c.emails).toHaveLength(emails + 1);
    expect(c.emails.at(-1)).toMatchObject({ para: 'ana@exemplo.ao', assunto: 'O seu plano do Eveni passou a Empresarial' });
    expect(c.emails.at(-1)!.texto).toContain('«Espaço de Ana» passou a Empresarial');
  });

  it('o mesmo plano não muda nada, nem regista, nem envia e-mail', async () => {
    const admin = await administrador();
    await conta('ana@exemplo.ao', 'Ana');
    const antes = await espacoDe('ana@exemplo.ao');
    const emails = c.emails.length;
    expect((await mudar(admin, antes.id, 'singular')).json()).toMatchObject({ plano: 'singular', mudou: false });
    expect((await espacoDe('ana@exemplo.ao')).plan_started_at).toEqual(antes.plan_started_at);
    expect((await base.pool.query("select count(*)::int as n from audit_log where action = 'admin.plano_alterado'")).rows[0].n).toBe(0);
    expect(c.emails).toHaveLength(emails);
  });

  it.each([['ouro'], [''], [null], [1]])('recusa um plano inválido (%s)', async (plano) => {
    const admin = await administrador();
    const { id } = await espacoDe(ADMIN);
    const r = await mudar(admin, id, plano);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.plano).toBe('Escolha um plano válido.');
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'nao-e-id', "1' or '1'='1", '-'.repeat(36), `${'a'.repeat(32)}----`])('espaço inexistente (%s): 404', async (id) => {
    const admin = await administrador();
    expect((await mudar(admin, encodeURIComponent(id), 'grandes')).statusCode).toBe(404);
  });

  it('descer para o Singular com dois projectos: mantém-nos, mas não deixa criar mais', async () => {
    const admin = await administrador();
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const { id } = await espacoDe('ana@exemplo.ao');
    await mudar(admin, id, 'empresarial');
    const criar = (nome: string) => c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, ana);
    expect((await criar('Primeiro')).statusCode).toBe(201);
    expect((await criar('Segundo')).statusCode).toBe(201);

    const emails = c.emails.length;
    expect((await mudar(admin, id, 'singular')).json()).toMatchObject({ projectos: 2, acimaDoLimite: true });
    expect(c.emails.at(-1)!.texto).toContain('não pode criar mais projectos');
    expect(c.emails).toHaveLength(emails + 1);
    const lista = (await c.get('/api/admin/espacos?pesquisa=ana@', admin)).json();
    expect(lista[0]).toMatchObject({ plano: 'singular', projectos: 2, acimaDoLimite: true });

    // Recomeçar a data do plano não renova o limite do Singular (que é para sempre).
    const r = await criar('Terceiro');
    expect(r.statusCode).toBe(403);
    expect((await c.get('/api/projectos', ana)).json()).toHaveLength(2);
  });

  it('o Singular conta também projectos criados antes de uma mudança de plano', async () => {
    const admin = await administrador();
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const { id } = await espacoDe('ana@exemplo.ao');
    expect((await c.post('/api/projectos', { template: 'T01', nome: 'Único', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana)).statusCode).toBe(201);
    await mudar(admin, id, 'grandes');
    await mudar(admin, id, 'singular');
    expect((await c.post('/api/projectos', { template: 'T01', nome: 'Outro', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana)).statusCode).toBe(403);
  });
});
