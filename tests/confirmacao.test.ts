import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarGuardas } from '../src/server/contas/acesso.js';
import { limparExpirados } from '../src/server/contas/sessoes.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
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
  // Rota de exemplo protegida como serão as de criar projectos e links públicos.
  const guardas = criarGuardas(configTeste(), base);
  c.app.post('/api/teste/criar-evento', { preHandler: guardas.exigirEmailConfirmado }, async () => ({ criado: true }));
});
afterAll(async () => {
  await c.app.close();
  await base.fechar();
});

const confirmar = (token: unknown, ip?: string) => c.post('/api/auth/confirmar-email', { token }, undefined, ip);

describe('e-mail de confirmação no registo', () => {
  it('envia um e-mail em português com a ligação para o endereço público da aplicação', async () => {
    await c.registar('ana@exemplo.ao', 'Ana Domingos');
    expect(c.emails).toHaveLength(1);
    const email = c.emails[0]!;
    expect(email.para).toBe('ana@exemplo.ao');
    expect(email.assunto).toBe('Confirme o seu e-mail no Eveni');
    expect(email.texto).toContain('Olá, Ana Domingos');
    expect(email.texto).toContain('http://localhost:3000/confirmar-email?token=');
    expect(email.html).toContain('href="http://localhost:3000/confirmar-email?token=');
  });

  it('escapa o nome no HTML do e-mail', async () => {
    await c.registar('ana@exemplo.ao', '<script>alert(1)</script>');
    expect(c.emails[0]!.html).not.toContain('<script>');
    expect(c.emails[0]!.html).toContain('&lt;script&gt;');
  });

  it('não envia e-mail se o registo falhar', async () => {
    await c.registar('ana@exemplo.ao');
    await c.registar('ana@exemplo.ao');
    expect(c.emails).toHaveLength(1);
  });

  it('a base de dados guarda só o hash do token', async () => {
    await c.registar();
    const { rows } = await base.pool.query('select token_hash from email_tokens');
    expect(rows[0].token_hash).not.toBe(c.tokenDoUltimoEmail());
  });
});

describe('confirmar o e-mail', () => {
  it('a ligação confirma o e-mail, mesmo aberta noutro aparelho sem sessão', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await c.eu(cookie)).json().emailConfirmado).toBe(false);
    const r = await confirmar(c.tokenDoUltimoEmail());
    expect(r.statusCode).toBe(200);
    expect((await c.eu(cookie)).json().emailConfirmado).toBe(true);
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.email_confirmado'");
    expect(rows[0].n).toBe(1);
  });

  it('cada ligação só pode ser usada uma vez', async () => {
    await c.registar();
    const token = c.tokenDoUltimoEmail();
    expect((await confirmar(token)).statusCode).toBe(200);
    const segunda = await confirmar(token);
    expect(segunda.statusCode).toBe(400);
    expect(segunda.json().mensagem).toContain('inválida ou já expirou');
  });

  it('pedidos em paralelo com a mesma ligação só a usam uma vez', async () => {
    await c.registar();
    const token = c.tokenDoUltimoEmail();
    const respostas = await Promise.all(Array.from({ length: 5 }, () => confirmar(token)));
    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('recusa ligações expiradas', async () => {
    await c.registar();
    await base.pool.query("update email_tokens set expires_at = now() - interval '1 second'");
    expect((await confirmar(c.tokenDoUltimoEmail())).statusCode).toBe(400);
  });

  it.each([['inventado'], [''], [123], ['x'.repeat(500)]])('recusa tokens inválidos (%#)', async (token) => {
    await c.registar();
    expect((await confirmar(token)).statusCode).toBe(400);
    expect((await c.eu(cookieDe(await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'Kizomba-2026-evento' })))).json().emailConfirmado).toBe(false);
  });

  it('a ligação de uma pessoa nunca confirma a conta de outra', async () => {
    const daAna = cookieDe(await c.registar('ana@exemplo.ao'));
    const doBruno = cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno'));
    await confirmar(c.tokenDoUltimoEmail());
    expect((await c.eu(doBruno)).json().emailConfirmado).toBe(true);
    expect((await c.eu(daAna)).json().emailConfirmado).toBe(false);
  });

  it('limita tentativas de adivinhar ligações por IP', async () => {
    for (let i = 0; i < 30; i++) await confirmar(`inventado-${i}`, '203.0.113.5');
    expect((await confirmar('mais-um', '203.0.113.5')).statusCode).toBe(429);
  });
});

describe('reenviar a confirmação', () => {
  it('exige sessão', async () => {
    expect((await c.post('/api/auth/reenviar-confirmacao')).statusCode).toBe(401);
  });

  it('envia uma ligação nova e invalida a anterior', async () => {
    const cookie = cookieDe(await c.registar());
    const antiga = c.tokenDoUltimoEmail();
    expect((await c.post('/api/auth/reenviar-confirmacao', {}, cookie)).statusCode).toBe(204);
    expect(c.emails).toHaveLength(2);
    const nova = c.tokenDoUltimoEmail();
    expect(nova).not.toBe(antiga);
    expect((await confirmar(antiga)).statusCode).toBe(400);
    expect((await confirmar(nova)).statusCode).toBe(200);
  });

  it('no máximo 3 reenvios por hora, para não encher a caixa de correio de ninguém', async () => {
    const cookie = cookieDe(await c.registar());
    for (let i = 0; i < 3; i++) expect((await c.post('/api/auth/reenviar-confirmacao', {}, cookie)).statusCode).toBe(204);
    expect((await c.post('/api/auth/reenviar-confirmacao', {}, cookie)).statusCode).toBe(429);
    expect(c.emails).toHaveLength(4);
  });

  it('com o e-mail já confirmado, não envia nada nem gasta o limite', async () => {
    const cookie = cookieDe(await c.registar());
    await confirmar(c.tokenDoUltimoEmail());
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/reenviar-confirmacao', {}, cookie)).statusCode).toBe(204);
    expect(c.emails).toHaveLength(1);
  });

  it('reenvios em simultâneo deixam só uma ligação válida', async () => {
    const cookie = cookieDe(await c.registar());
    await Promise.all([1, 2, 3].map(() => c.post('/api/auth/reenviar-confirmacao', {}, cookie)));
    const { rows } = await base.pool.query("select count(*)::int as n from email_tokens where used_at is null");
    expect(rows[0].n).toBe(1);
  });
});

describe('quem não confirmou o e-mail entra mas não cria', () => {
  it('sem sessão: 401', async () => {
    expect((await c.post('/api/teste/criar-evento')).statusCode).toBe(401);
  });

  it('com e-mail por confirmar: 403 com explicação', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await c.eu(cookie)).statusCode).toBe(200);
    const r = await c.post('/api/teste/criar-evento', {}, cookie);
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toContain('Confirme o seu e-mail');
  });

  it('depois de confirmar: pode criar', async () => {
    const cookie = cookieDe(await c.registar());
    await confirmar(c.tokenDoUltimoEmail());
    expect((await c.post('/api/teste/criar-evento', {}, cookie)).statusCode).toBe(200);
  });
});

describe('limpeza periódica', () => {
  it('apaga ligações expiradas ou usadas há mais de um dia, e mantém as válidas', async () => {
    await c.registar('ana@exemplo.ao');
    await c.registar('bruno@exemplo.ao', 'Bruno');
    await c.registar('carla@exemplo.ao', 'Carla');
    await base.pool.query(`update email_tokens set expires_at = now() - interval '2 days'
      where user_id = (select id from users where email = 'ana@exemplo.ao')`);
    await base.pool.query(`update email_tokens set used_at = now() - interval '2 days'
      where user_id = (select id from users where email = 'bruno@exemplo.ao')`);
    expect((await limparExpirados(base.pool)).ligacoes).toBe(2);
    expect((await confirmar(c.tokenDoUltimoEmail())).statusCode).toBe(200);
  });

  it('apaga contas por confirmar há mais de 7 dias, com o espaço pessoal, e mantém as restantes', async () => {
    await c.registar('antiga@exemplo.ao', 'Antiga');
    await c.registar('confirmada@exemplo.ao', 'Confirmada');
    await confirmar(c.tokenDoUltimoEmail());
    await c.registar('recente@exemplo.ao', 'Recente');
    await base.pool.query("update users set created_at = now() - interval '8 days' where email in ('antiga@exemplo.ao', 'confirmada@exemplo.ao')");

    expect((await limparExpirados(base.pool)).contas).toBe(1);
    const { rows: utilizadores } = await base.pool.query('select email from users order by email');
    expect(utilizadores.map((u) => u.email)).toEqual(['confirmada@exemplo.ao', 'recente@exemplo.ao']);
    const { rows: espacos } = await base.pool.query('select name from workspaces order by name');
    expect(espacos.map((e) => e.name)).toEqual(['Espaço de Confirmada', 'Espaço de Recente']);
    // O e-mail fica livre para o verdadeiro dono.
    expect((await c.registar('antiga@exemplo.ao', 'Dona verdadeira')).statusCode).toBe(201);
  });
});
