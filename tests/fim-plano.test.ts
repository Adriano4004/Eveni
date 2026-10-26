import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { verificarPlanos } from '../src/server/pagamentos/fim-plano.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { configTeste, limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente } from './cliente.js';

// Fim do período pago (decisão 030): avisos 7 dias antes e no dia, regresso ao Singular 7 dias depois.
const ADMIN = 'adriano@eveni.ao';
const DIA = 24 * 60 * 60 * 1000;
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

const espacoDe = async (email: string) =>
  (
    await base.pool.query<{ id: string; plan_code: string; plan_ends_at: Date | null; plan_started_at: Date }>(
      `select w.id, w.plan_code, w.plan_ends_at, w.plan_started_at from workspaces w join workspace_members wm on wm.workspace_id = w.id
         join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner'`,
      [email],
    )
  ).rows[0]!;

// Espaço da Ana no Empresarial, com fim em `fim`.
async function anaComPlano(fim: Date) {
  const cookie = await conta('ana@exemplo.ao', 'Ana');
  await base.pool.query(
    `update workspaces set plan_code = 'empresarial', plan_ends_at = $2
      where id = (select workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner')`,
    ['ana@exemplo.ao', fim],
  );
  return cookie;
}

const emails: { para: string; assunto: string; texto: string }[] = [];
const verificar = (agora: Date) => verificarPlanos(base.pool, configTeste(), (m) => emails.push(m), agora);
beforeEach(() => {
  emails.length = 0;
});

describe('avisos', () => {
  const fim = new Date('2026-12-01T10:00:00Z');

  it('nada a mais de 7 dias do fim', async () => {
    await anaComPlano(fim);
    expect(await verificar(new Date(fim.getTime() - 7 * DIA - 1000))).toEqual({ avisosAntes: 0, avisosFim: 0, descidas: 0 });
    expect(emails).toEqual([]);
  });

  it('a 7 dias exactos, um aviso; repetir a verificação não manda outro', async () => {
    await anaComPlano(fim);
    const agora = new Date(fim.getTime() - 7 * DIA);
    expect(await verificar(agora)).toMatchObject({ avisosAntes: 1 });
    expect(await verificar(new Date(agora.getTime() + 60 * 60 * 1000))).toMatchObject({ avisosAntes: 0 });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ para: 'ana@exemplo.ao', assunto: 'O seu plano Empresarial acaba a 01/12/2026' });
    expect(emails[0]!.texto).toContain('/conta/plano');
  });

  it('duas verificações ao mesmo tempo (duas instâncias) mandam um só aviso', async () => {
    await anaComPlano(fim);
    const agora = new Date(fim.getTime() - DIA);
    await Promise.all([verificar(agora), verificar(agora), verificar(agora)]);
    expect(emails).toHaveLength(1);
  });

  it('no fim, um aviso com o dia em que volta ao Singular; o plano mantém-se', async () => {
    await anaComPlano(fim);
    expect(await verificar(fim)).toMatchObject({ avisosFim: 1, descidas: 0 });
    expect(emails[0]).toMatchObject({ assunto: 'O seu plano Empresarial acabou hoje' });
    expect(emails[0]!.texto).toContain('até 08/12/2026');
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('empresarial');
    await verificar(new Date(fim.getTime() + 3 * DIA));
    expect(emails).toHaveLength(1);
  });

  it('sem data de fim (Singular, ou plano mudado à mão) nunca há avisos nem descida', async () => {
    await conta('ana@exemplo.ao', 'Ana');
    await base.pool.query("update workspaces set plan_code = 'grandes', plan_ends_at = null");
    expect(await verificar(new Date('2030-01-01T00:00:00Z'))).toEqual({ avisosAntes: 0, avisosFim: 0, descidas: 0 });
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('grandes');
  });
});

describe('regresso ao Singular', () => {
  const fim = new Date('2026-12-01T10:00:00Z');

  it('um segundo antes do fim da tolerância, ainda não; depois, volta ao Singular, regista e avisa', async () => {
    await anaComPlano(fim);
    await verificar(new Date(fim.getTime() + 7 * DIA - 1000));
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('empresarial');
    emails.length = 0;

    expect(await verificar(new Date(fim.getTime() + 7 * DIA))).toMatchObject({ descidas: 1 });
    const w = await espacoDe('ana@exemplo.ao');
    expect(w).toMatchObject({ plan_code: 'singular', plan_ends_at: null });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ para: 'ana@exemplo.ao', assunto: 'O seu espaço voltou ao plano Singular' });
    const { rows } = await base.pool.query("select details, workspace_id, user_id from audit_log where action = 'plano.expirado'");
    expect(rows).toEqual([{ details: { de: 'empresarial', fim: fim.toISOString() }, workspace_id: w.id, user_id: null }]);

    // Só uma vez.
    expect(await verificar(new Date(fim.getTime() + 30 * DIA))).toMatchObject({ descidas: 0 });
    expect(emails).toHaveLength(1);
  });

  it('com dois projectos, mantém-nos mas não deixa criar mais', async () => {
    const ana = await anaComPlano(new Date(Date.now() + 60 * DIA));
    const criar = (nome: string) => c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, ana);
    expect((await criar('Primeiro')).statusCode).toBe(201);
    expect((await criar('Segundo')).statusCode).toBe(201);
    await base.pool.query("update workspaces set plan_ends_at = now() - interval '8 days'");
    await verificarPlanos(base.pool, configTeste(), (m) => emails.push(m));
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('singular');
    expect(emails.at(-1)!.texto).toContain('Tudo o que já existe mantém-se');
    expect((await c.get('/api/projectos', ana)).json()).toHaveLength(2);
    expect((await criar('Terceiro')).statusCode).toBe(403);
  });

  it('com um comprovativo por confirmar, não avisa nem desce; depois da recusa, desce', async () => {
    const ana = await anaComPlano(fim);
    const id = (await c.post('/api/pagamentos', { plano: 'empresarial', periodo: 'monthly' }, ana)).json().emAberto.id;
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`;
    expect((await c.post(`/api/pagamentos/${id}/comprovativo`, { ficheiro: pdf }, ana)).statusCode).toBe(200);
    emails.length = 0;

    expect(await verificar(new Date(fim.getTime() + 20 * DIA))).toEqual({ avisosAntes: 0, avisosFim: 0, descidas: 0 });
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('empresarial');

    await base.pool.query("update payments set status = 'rejected', decided_at = now(), rejection_reason = 'x'");
    expect(await verificar(new Date(fim.getTime() + 20 * DIA))).toMatchObject({ descidas: 1 });
  });

  it('um comprovativo enviado depois do fim da tolerância não trava a descida', async () => {
    const ana = await anaComPlano(fim);
    const id = (await c.post('/api/pagamentos', { plano: 'empresarial', periodo: 'monthly' }, ana)).json().emAberto.id;
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`;
    expect((await c.post(`/api/pagamentos/${id}/comprovativo`, { ficheiro: pdf }, ana)).statusCode).toBe(200);
    await base.pool.query("update payments set proof_uploaded_at = $1", [new Date(fim.getTime() + 7 * DIA + 1000)]);
    expect(await verificar(new Date(fim.getTime() + 8 * DIA))).toMatchObject({ descidas: 1 });
  });

  it('um pedido sem comprovativo não trava a descida', async () => {
    const ana = await anaComPlano(fim);
    expect((await c.post('/api/pagamentos', { plano: 'empresarial', periodo: 'monthly' }, ana)).statusCode).toBe(201);
    expect(await verificar(new Date(fim.getTime() + 7 * DIA))).toMatchObject({ descidas: 1 });
  });
});

describe('renovar dentro da tolerância', () => {
  async function confirmarRenovacao(ana: string, periodo = 'monthly', plano = 'empresarial') {
    const id = (await c.post('/api/pagamentos', { plano, periodo }, ana)).json().emAberto.id;
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`;
    await c.post(`/api/pagamentos/${id}/comprovativo`, { ficheiro: pdf }, ana);
    const admin = await conta(ADMIN, 'Adriano');
    await base.pool.query("update users set totp_enabled_at = now(), totp_secret = 'x' where email = $1", [ADMIN]);
    expect((await c.post(`/api/admin/pagamentos/${id}/confirmar`, {}, admin)).statusCode).toBe(200);
  }

  it('o plano acabou há 3 dias: o novo período conta a partir do fim anterior', async () => {
    const fim = new Date(Date.now() - 3 * DIA);
    const ana = await anaComPlano(fim);
    await confirmarRenovacao(ana);
    const { rows } = await base.pool.query<{ esperado: Date }>("select $1::timestamptz + interval '1 month' as esperado", [fim]);
    expect((await espacoDe('ana@exemplo.ao')).plan_ends_at).toEqual(rows[0]!.esperado);
    // Com a data nova, o aviso de fim volta a poder sair no fim do novo período (e não sai já).
    expect(await verificarPlanos(base.pool, configTeste(), (m) => emails.push(m))).toEqual({ avisosAntes: 0, avisosFim: 0, descidas: 0 });
  });

  it('a tolerância já tinha passado (comprovativo parado à espera): o período começa no dia da confirmação', async () => {
    const ana = await anaComPlano(new Date(Date.now() - 10 * DIA));
    await confirmarRenovacao(ana);
    const fim = (await espacoDe('ana@exemplo.ao')).plan_ends_at!;
    const dias = (fim.getTime() - Date.now()) / DIA;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);
  });
});

describe('ecrãs', () => {
  it('a sessão inclui a data de fim do plano', async () => {
    const fim = new Date('2026-12-01T10:00:00Z');
    const ana = await anaComPlano(fim);
    expect((await c.eu(ana)).json().espaco).toMatchObject({ plano: 'empresarial', fim: fim.toISOString() });
  });
});
