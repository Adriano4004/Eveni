import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { lerComprovativo } from '../src/server/pagamentos/rotas.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { valorDoPagamento } from '../src/shared/pagamentos.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

// Pagamentos por transferência (decisão 029).
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

async function conta(email: string, nome: string, confirmar = true) {
  const cookie = cookieDe(await c.registar(email, nome));
  if (confirmar) expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return cookie;
}

async function administrador() {
  const cookie = await conta(ADMIN, 'Adriano');
  await base.pool.query("update users set totp_enabled_at = now(), totp_secret = 'x' where email = $1", [ADMIN]);
  return cookie;
}

const espacoDe = async (email: string) =>
  (
    await base.pool.query<{ id: string; plan_code: string; plan_started_at: Date; plan_ends_at: Date | null }>(
      `select w.id, w.plan_code, w.plan_started_at, w.plan_ends_at from workspaces w join workspace_members wm on wm.workspace_id = w.id
         join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner'`,
      [email],
    )
  ).rows[0]!;

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% comprovativo\n').toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')}`;

const pedir = (cookie: string | undefined, plano: unknown = 'empresarial', periodo: unknown = 'monthly') => c.post('/api/pagamentos', { plano, periodo }, cookie);
const enviar = (cookie: string | undefined, id: string, ficheiro: unknown = PDF) => c.post(`/api/pagamentos/${id}/comprovativo`, { ficheiro }, cookie);
const confirmar = (cookie: string | undefined, id: string) => c.post(`/api/admin/pagamentos/${id}/confirmar`, {}, cookie);
const recusar = (cookie: string | undefined, id: string, motivo: unknown = 'Transferência não encontrada no extracto.') =>
  c.post(`/api/admin/pagamentos/${id}/recusar`, { motivo }, cookie);

// Pede, envia o comprovativo e devolve o id do pagamento.
async function pagamentoPorConfirmar(cookie: string, plano = 'empresarial', periodo = 'monthly') {
  const r = await pedir(cookie, plano, periodo);
  expect(r.statusCode).toBe(201);
  const id = r.json().emAberto.id as string;
  expect((await enviar(cookie, id)).statusCode).toBe(200);
  return id;
}

describe('valores', () => {
  it('mensal ao preço do plano; anual com 10% de desconto sobre 12 meses', () => {
    expect(valorDoPagamento('empresarial', 'monthly')).toBe(37_000_000);
    expect(valorDoPagamento('grandes', 'monthly')).toBe(64_000_000);
    expect(valorDoPagamento('empresarial', 'yearly')).toBe(399_600_000);
    expect(valorDoPagamento('grandes', 'yearly')).toBe(691_200_000);
  });
});

describe('comprovativo', () => {
  it('aceita PDF, PNG e JPEG pelo conteúdo, não pelo tipo declarado', () => {
    expect(lerComprovativo(PDF).tipo).toBe('application/pdf');
    expect(lerComprovativo(PNG).tipo).toBe('image/png');
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]).toString('base64')}`;
    expect(lerComprovativo(jpeg).tipo).toBe('image/jpeg');
    // Declarado como PDF, mas é HTML.
    expect(() => lerComprovativo(`data:application/pdf;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`)).toThrow();
    expect(() => lerComprovativo(`data:text/html;base64,${Buffer.from('%PDF-').toString('base64')}`)).toThrow();
    expect(() => lerComprovativo('nao-e-data-url')).toThrow();
  });

  it('recusa ficheiros com mais de 5 MB', () => {
    const grande = Buffer.alloc(5 * 1024 * 1024 + 1);
    grande.write('%PDF-');
    expect(() => lerComprovativo(`data:application/pdf;base64,${grande.toString('base64')}`)).toThrow();
  });
});

describe('pedir e pagar', () => {
  it('pedido, referência, comprovativo e aviso aos administradores', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const inicial = (await c.get('/api/pagamentos', ana)).json();
    expect(inicial).toEqual({ plano: 'singular', fim: null, podePagar: true, emAberto: null, historico: [] });

    const r = await pedir(ana, 'grandes', 'yearly');
    expect(r.statusCode).toBe(201);
    const aberto = r.json().emAberto;
    expect(aberto).toMatchObject({ plano: 'grandes', periodo: 'yearly', valorCentimos: 691_200_000, estado: 'awaiting_proof', temComprovativo: false });
    expect(aberto.referencia).toMatch(new RegExp(`^EVN-${hojeEmLuanda().slice(0, 4)}-\\d{5}$`));

    const emails = c.emails.length;
    const e = await enviar(ana, aberto.id);
    expect(e.statusCode).toBe(200);
    expect(e.json().emAberto).toMatchObject({ estado: 'pending', temComprovativo: true });
    expect(c.emails).toHaveLength(emails + 1);
    expect(c.emails.at(-1)).toMatchObject({ para: ADMIN, assunto: `Comprovativo recebido: ${aberto.referencia}` });
    expect(c.emails.at(-1)!.texto).toMatch(/6\s912\s000,00\sKz/);

    // Pode substituir o comprovativo enquanto não for confirmado.
    expect((await enviar(ana, aberto.id, PNG)).statusCode).toBe(200);
    const d = await c.app.inject({ method: 'GET', url: `/api/pagamentos/${aberto.id}/comprovativo`, headers: { cookie: ana } });
    expect(d.statusCode).toBe(200);
    expect(d.headers['content-type']).toBe('image/png');
    expect(d.headers['content-disposition']).toBe(`attachment; filename="comprovativo-${aberto.referencia}.png"`);
    expect(d.headers['x-content-type-options']).toBe('nosniff');

    const { rows } = await base.pool.query("select action from audit_log where action like 'pagamento.%' order by id");
    expect(rows.map((l) => l.action)).toEqual(['pagamento.pedido', 'pagamento.comprovativo', 'pagamento.comprovativo']);
  });

  it('só um pedido em aberto de cada vez, mesmo em simultâneo', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const rs = await Promise.all([pedir(ana), pedir(ana), pedir(ana)]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(rs.find((r) => r.statusCode === 409)!.json().mensagem).toMatch(/Já tem um pedido/);
    expect((await base.pool.query('select count(*)::int as n from payments')).rows[0].n).toBe(1);
  });

  it('cancelar apaga o comprovativo e deixa fazer outro pedido', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const r = await c.post(`/api/pagamentos/${id}/cancelar`, {}, ana);
    expect(r.statusCode).toBe(200);
    expect(r.json().emAberto).toBeNull();
    expect(r.json().historico[0]).toMatchObject({ id, estado: 'cancelled', temComprovativo: false });
    expect((await c.post(`/api/pagamentos/${id}/cancelar`, {}, ana)).statusCode).toBe(409);
    expect((await enviar(ana, id)).statusCode).toBe(409);
    expect((await pedir(ana)).statusCode).toBe(201);
  });

  it.each([
    [{ plano: 'singular', periodo: 'monthly' }, 'plano'],
    [{ plano: 'ouro', periodo: 'monthly' }, 'plano'],
    [{ plano: 'empresarial', periodo: 'semanal' }, 'periodo'],
    [{ plano: 'empresarial' }, 'periodo'],
  ])('recusa um pedido inválido (%o)', async (corpo, campo) => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const r = await c.post('/api/pagamentos', corpo, ana);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos[campo]).toBeTruthy();
  });

  it('recusa um comprovativo que não é PDF nem imagem', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = (await pedir(ana)).json().emAberto.id;
    const html = `data:application/pdf;base64,${Buffer.from('<html>').toString('base64')}`;
    const r = await enviar(ana, id, html);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.ficheiro).toBeTruthy();
    expect((await c.get('/api/pagamentos', ana)).json().emAberto.estado).toBe('awaiting_proof');
  });

  it('o valor é sempre o do servidor, nunca o que vem no pedido', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const r = await c.post('/api/pagamentos', { plano: 'grandes', periodo: 'monthly', valorCentimos: 1 }, ana);
    expect(r.json().emAberto.valorCentimos).toBe(64_000_000);
  });
});

describe('acessos indevidos', () => {
  it('sem sessão: 401 em tudo', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    expect((await c.get('/api/pagamentos')).statusCode).toBe(401);
    expect((await pedir(undefined)).statusCode).toBe(401);
    expect((await enviar(undefined, id)).statusCode).toBe(401);
    expect((await c.post(`/api/pagamentos/${id}/cancelar`, {})).statusCode).toBe(401);
    expect((await c.get(`/api/pagamentos/${id}/comprovativo`)).statusCode).toBe(401);
    expect((await confirmar(undefined, id)).statusCode).toBe(401);
  });

  it('sem o e-mail confirmado não pede nem envia comprovativos', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana', false);
    expect((await pedir(ana)).statusCode).toBe(403);
  });

  it('outra pessoa não vê, não envia, não cancela nem descarrega o pagamento de outro espaço', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const bruno = await conta('bruno@exemplo.ao', 'Bruno');
    expect((await c.get('/api/pagamentos', bruno)).json().emAberto).toBeNull();
    expect((await enviar(bruno, id, PNG)).statusCode).toBe(404);
    expect((await c.post(`/api/pagamentos/${id}/cancelar`, {}, bruno)).statusCode).toBe(404);
    expect((await c.get(`/api/pagamentos/${id}/comprovativo`, bruno)).statusCode).toBe(404);
    expect((await c.get(`/api/admin/pagamentos/${id}/comprovativo`, bruno)).statusCode).toBe(404);
    // O comprovativo da Ana ficou intacto.
    const { rows } = await base.pool.query('select status, proof_type from payments where id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'pending', proof_type: 'application/pdf' });
  });

  it('um membro da equipa (não dono) não paga pelo espaço de outro', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const { id: espaco } = await espacoDe('ana@exemplo.ao');
    const bruno = await conta('bruno@exemplo.ao', 'Bruno');
    const { rows } = await base.pool.query("select id from users where email = 'bruno@exemplo.ao'");
    await base.pool.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [espaco, rows[0].id]);
    await pedir(bruno);
    // O pedido do Bruno é para o espaço dele, nunca para o da Ana.
    expect((await base.pool.query('select count(*)::int as n from payments where workspace_id = $1', [espaco])).rows[0].n).toBe(0);
    expect((await c.get('/api/pagamentos', ana)).json().emAberto).toBeNull();
  });

  it('um cliente comum não lista, não confirma nem recusa (404), mesmo o próprio pagamento', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    await base.pool.query("update users set totp_enabled_at = now(), totp_secret = 'x' where email = 'ana@exemplo.ao'");
    const id = await pagamentoPorConfirmar(ana);
    expect((await c.get('/api/admin/pagamentos', ana)).statusCode).toBe(404);
    expect((await confirmar(ana, id)).statusCode).toBe(404);
    expect((await recusar(ana, id)).statusCode).toBe(404);
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('singular');
  });

  it('o administrador sem dois passos é recusado (403)', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const admin = await conta(ADMIN, 'Adriano');
    expect((await c.get('/api/admin/pagamentos', admin)).statusCode).toBe(403);
    expect((await confirmar(admin, id)).statusCode).toBe(403);
    expect((await c.get(`/api/admin/pagamentos/${id}/comprovativo`, admin)).statusCode).toBe(403);
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'nao-e-id', "1' or '1'='1", '-'.repeat(36)])('id inválido ou inexistente (%s): 404', async (id) => {
    const admin = await administrador();
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const alvo = encodeURIComponent(id);
    expect((await confirmar(admin, alvo)).statusCode).toBe(404);
    expect((await enviar(ana, alvo)).statusCode).toBe(404);
    expect((await c.get(`/api/pagamentos/${alvo}/comprovativo`, ana)).statusCode).toBe(404);
  });

  it('as respostas não expõem o comprovativo nem segredos', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    await pagamentoPorConfirmar(ana);
    const admin = await administrador();
    for (const corpo of [(await c.get('/api/pagamentos', ana)).body, (await c.get('/api/admin/pagamentos', admin)).body]) {
      expect(corpo).not.toMatch(/JVBERi|proof|password|hash|totp|token|secret/i);
    }
  });
});

describe('administração', () => {
  it('confirmar activa o plano por um mês, avisa o dono e regista', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const admin = await administrador();

    const lista = (await c.get('/api/admin/pagamentos', admin)).json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id, estado: 'pending', espaco: { nome: 'Espaço de Ana' }, dono: { nome: 'Ana', email: 'ana@exemplo.ao' } });
    const d = await c.get(`/api/admin/pagamentos/${id}/comprovativo`, admin);
    expect(d.statusCode).toBe(200);
    expect(d.headers['content-type']).toBe('application/pdf');

    const emails = c.emails.length;
    const r = await confirmar(admin, id);
    expect(r.statusCode).toBe(200);
    const espaco = await espacoDe('ana@exemplo.ao');
    expect(espaco.plan_code).toBe('empresarial');
    const meses = (espaco.plan_ends_at!.getTime() - Date.now()) / 86_400_000;
    expect(meses).toBeGreaterThan(27);
    expect(meses).toBeLessThan(32);
    expect(r.json().fim).toBe(espaco.plan_ends_at!.toISOString());

    expect(c.emails).toHaveLength(emails + 1);
    expect(c.emails.at(-1)).toMatchObject({ para: 'ana@exemplo.ao', assunto: 'Pagamento confirmado: plano Empresarial activo' });

    expect((await confirmar(admin, id)).statusCode).toBe(409);
    expect((await recusar(admin, id)).statusCode).toBe(409);
    expect((await c.post(`/api/pagamentos/${id}/cancelar`, {}, ana)).statusCode).toBe(409);
    expect((await c.get('/api/admin/pagamentos', admin)).json()).toEqual([]);

    const situacao = (await c.get('/api/pagamentos', ana)).json();
    expect(situacao).toMatchObject({ plano: 'empresarial', fim: espaco.plan_ends_at!.toISOString(), emAberto: null });
    expect(situacao.historico[0]).toMatchObject({ estado: 'confirmed', fim: espaco.plan_ends_at!.toISOString() });

    const { rows } = await base.pool.query("select u.email from audit_log a join users u on u.id = a.user_id where a.action = 'pagamento.confirmado'");
    expect(rows).toEqual([{ email: ADMIN }]);

    // Com o plano Empresarial, a Ana já cria mais de um projecto.
    const criar = (nome: string) => c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, ana);
    expect((await criar('Primeiro')).statusCode).toBe(201);
    expect((await criar('Segundo')).statusCode).toBe(201);
  });

  it('renovar o mesmo plano soma ao fim do período actual; mudar de plano começa hoje', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const admin = await administrador();
    await confirmar(admin, await pagamentoPorConfirmar(ana, 'empresarial', 'monthly'));
    const primeiro = await espacoDe('ana@exemplo.ao');

    await confirmar(admin, await pagamentoPorConfirmar(ana, 'empresarial', 'yearly'));
    const renovado = await espacoDe('ana@exemplo.ao');
    const { rows } = await base.pool.query<{ fim: Date }>("select $1::timestamptz + interval '12 months' as fim", [primeiro.plan_ends_at]);
    expect(renovado.plan_ends_at).toEqual(rows[0]!.fim);
    // A data de início do plano não muda numa renovação.
    expect(renovado.plan_started_at).toEqual(primeiro.plan_started_at);

    await confirmar(admin, await pagamentoPorConfirmar(ana, 'grandes', 'monthly'));
    const subiu = await espacoDe('ana@exemplo.ao');
    expect(subiu.plan_code).toBe('grandes');
    expect(subiu.plan_ends_at!.getTime()).toBeLessThan(renovado.plan_ends_at!.getTime());
    expect(subiu.plan_started_at.getTime()).toBeGreaterThan(primeiro.plan_started_at.getTime());
  });

  it('recusar exige motivo, avisa o dono e deixa fazer novo pedido', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const admin = await administrador();
    expect((await recusar(admin, id, '')).statusCode).toBe(400);
    expect((await recusar(admin, id, 'x'.repeat(501))).statusCode).toBe(400);

    const emails = c.emails.length;
    expect((await recusar(admin, id)).statusCode).toBe(200);
    expect(c.emails).toHaveLength(emails + 1);
    expect(c.emails.at(-1)!.texto).toContain('Transferência não encontrada no extracto.');
    expect((await espacoDe('ana@exemplo.ao')).plan_code).toBe('singular');
    expect((await c.get('/api/pagamentos', ana)).json().historico[0]).toMatchObject({ estado: 'rejected', motivoRecusa: 'Transferência não encontrada no extracto.' });
    expect((await pedir(ana)).statusCode).toBe(201);
  });

  it('não confirma um pagamento sem comprovativo', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = (await pedir(ana)).json().emAberto.id;
    const admin = await administrador();
    expect((await confirmar(admin, id)).statusCode).toBe(409);
  });

  it('a mudança de plano à mão tira a data de fim', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const admin = await administrador();
    await confirmar(admin, await pagamentoPorConfirmar(ana));
    const { id } = await espacoDe('ana@exemplo.ao');
    await c.post(`/api/admin/espacos/${id}/plano`, { plano: 'grandes' }, admin);
    expect((await espacoDe('ana@exemplo.ao')).plan_ends_at).toBeNull();
  });
});

describe('dados pessoais', () => {
  it('a exportação inclui os pagamentos com o comprovativo; eliminar a conta apaga-os', async () => {
    const ana = await conta('ana@exemplo.ao', 'Ana');
    const id = await pagamentoPorConfirmar(ana);
    const exp = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, ana)).json();
    expect(exp.pagamentos).toHaveLength(1);
    expect(exp.pagamentos[0]).toMatchObject({ referencia: expect.stringMatching(/^EVN-/), estado: 'pending', valorCentimos: 37_000_000 });
    expect(exp.pagamentos[0].comprovativo).toMatch(/^data:application\/pdf;base64,JVBERi/);

    expect((await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, ana)).statusCode).toBe(204);
    expect((await base.pool.query('select count(*)::int as n from payments where id = $1', [id])).rows[0].n).toBe(0);
  });
});
