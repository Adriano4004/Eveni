import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/server/config.js';
import { limparExpirados } from '../src/server/contas/sessoes.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const base = criarBaseDeDados(URL_BD_TESTE);
let cliente: Awaited<ReturnType<typeof criarCliente>>;
let app: FastifyInstance;

async function novaApp(extra: Partial<Config> = {}) {
  cliente = await criarCliente(base, extra);
  return cliente.app;
}
const post = (...a: Parameters<typeof cliente.post>) => cliente.post(...a);
const eu = (cookie?: string) => cliente.eu(cookie);
const registar = (email?: string, nome?: string) => cliente.registar(email, nome);

beforeAll(async () => {
  await aplicarMigracoes(base, 'drizzle');
});
beforeEach(async () => {
  await limparBaseDeDados(base.pool);
  app = await novaApp();
});
afterAll(async () => {
  await app.close();
  await base.fechar();
});

describe('registo', () => {
  it('cria a conta, o espaço pessoal no plano Singular e inicia sessão', async () => {
    const r = await registar('Ana@Exemplo.AO ');
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Ana Domingos',
      email: 'ana@exemplo.ao',
      emailConfirmado: false,
      espaco: { nome: 'Espaço de Ana Domingos', plano: 'singular' },
    });
    const { rows } = await base.pool.query("select role from workspace_members");
    expect(rows).toEqual([{ role: 'owner' }]);
    expect((await eu(cookieDe(r))).statusCode).toBe(200);
  });

  it('o cookie de sessão é HttpOnly e SameSite=Lax', async () => {
    const c = (await registar()).cookies.find((k) => k.name === 'eveni_sessao')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
    expect(c.path).toBe('/');
  });

  it('fora do ambiente local o cookie é Secure e usa o prefixo __Host-', async () => {
    app = await novaApp({ APP_ENV: 'staging' });
    const c = (await registar()).cookies.find((k) => k.name.endsWith('eveni_sessao'))!;
    expect(c.name).toBe('__Host-eveni_sessao');
    expect(c.secure).toBe(true);
  });

  it('recusa e-mail repetido, mesmo com maiúsculas diferentes', async () => {
    await registar('ana@exemplo.ao');
    const r = await registar('ANA@exemplo.ao');
    expect(r.statusCode).toBe(409);
    expect(r.json().campos.email).toContain('Já existe uma conta');
  });

  it.each([
    [{ nome: '', email: 'a@b.ao', palavraPasse: PALAVRA_PASSE }, 'nome', 'Indique o seu nome.'],
    [{ nome: 'Ana', email: 'nao-e-email', palavraPasse: PALAVRA_PASSE }, 'email', 'Indique um e-mail válido.'],
    [{ nome: 'Ana', email: 'a@b.ao', palavraPasse: 'curta1' }, 'palavraPasse', 'pelo menos 10 caracteres'],
    [{ nome: 'Ana', email: 'a@b.ao', palavraPasse: 'sonumerossim' }, 'palavraPasse', 'letras e números'],
    [{ nome: 'Ana', email: 'a@b.ao', palavraPasse: 'Angola2026' }, 'palavraPasse', 'demasiado comum'],
    [{ nome: 'Ana', email: 'a@b.ao', palavraPasse: `a1${'x'.repeat(250)}` }, 'palavraPasse', 'demasiado longa'],
  ])('valida os dados em português (%#)', async (dados, campo, texto) => {
    const r = await post('/api/auth/registo', dados);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos[campo]).toContain(texto);
  });

  it('limita o número de registos por IP', async () => {
    for (let i = 0; i < 30; i++) expect((await registar(`p${i}@exemplo.ao`)).statusCode).toBe(201);
    const r = await registar('p30@exemplo.ao');
    expect(r.statusCode).toBe(429);
    expect(r.json().mensagem).toContain('Demasiados pedidos');
  });
});

describe('entrar', () => {
  beforeEach(async () => {
    await registar();
  });

  it('entra com as credenciais certas', async () => {
    const r = await post('/api/auth/entrar', { email: 'ANA@exemplo.ao', palavraPasse: PALAVRA_PASSE });
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe('ana@exemplo.ao');
    expect((await eu(cookieDe(r))).statusCode).toBe(200);
  });

  it('palavra-passe errada e e-mail inexistente dão exactamente a mesma resposta', async () => {
    const errada = await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' });
    const inexistente = await post('/api/auth/entrar', { email: 'ninguem@exemplo.ao', palavraPasse: 'errada-123456' });
    expect(errada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(errada.body).toBe(inexistente.body);
    expect(errada.json()).toEqual({ mensagem: 'E-mail ou palavra-passe incorrectos.' });
    expect(errada.cookies).toHaveLength(0);
  });

  const errada = { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' };
  const certa = { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE };

  it('após 10 falhas a partir do mesmo IP, bloqueia esse IP para essa conta, mesmo com a palavra-passe certa', async () => {
    for (let i = 0; i < 10; i++) expect((await post('/api/auth/entrar', errada, undefined, '203.0.113.7')).statusCode).toBe(401);
    const r = await post('/api/auth/entrar', certa, undefined, '203.0.113.7');
    expect(r.statusCode).toBe(429);
    expect(r.json().mensagem).toContain('aguarde uma hora');
  });

  it('um atacante num IP não impede o dono de entrar a partir de outro IP', async () => {
    for (let i = 0; i < 12; i++) await post('/api/auth/entrar', errada, undefined, '203.0.113.7');
    expect((await post('/api/auth/entrar', certa, undefined, '198.51.100.50')).statusCode).toBe(200);
  });

  it('um ataque distribuído por muitos IPs bloqueia a conta ao fim de 50 tentativas', async () => {
    for (let i = 0; i < 50; i++) await post('/api/auth/entrar', errada, undefined, `203.0.113.${i}`);
    expect((await post('/api/auth/entrar', certa, undefined, '198.51.100.50')).statusCode).toBe(429);
  });

  it('pedidos em paralelo não escapam ao limite', async () => {
    const respostas = await Promise.all(Array.from({ length: 20 }, () => post('/api/auth/entrar', errada, undefined, '203.0.113.7')));
    const verificadas = respostas.filter((r) => r.statusCode === 401).length;
    expect(verificadas).toBe(10);
    expect(respostas.filter((r) => r.statusCode === 429)).toHaveLength(10);
  });

  it('o bloqueio fica registado na auditoria uma só vez', async () => {
    for (let i = 0; i < 15; i++) await post('/api/auth/entrar', errada, undefined, '203.0.113.7');
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'sessao.bloqueada'");
    expect(rows[0].n).toBe(1);
  });

  it('uma entrada certa limpa as falhas anteriores', async () => {
    for (let i = 0; i < 9; i++) await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' });
    expect((await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE })).statusCode).toBe(200);
    expect((await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' })).statusCode).toBe(401);
    expect((await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE })).statusCode).toBe(200);
  });

  it('regista entradas e falhas na auditoria', async () => {
    await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' });
    await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE });
    const { rows } = await base.pool.query('select action from audit_log order by id');
    expect(rows.map((r) => r.action)).toEqual(['conta.registo', 'sessao.entrar_falhado', 'sessao.entrar']);
  });
});

describe('sessões', () => {
  it('sem sessão, /eu responde 401', async () => {
    expect((await eu()).statusCode).toBe(401);
    expect((await eu('eveni_sessao=inventado')).statusCode).toBe(401);
  });

  it('terminar sessão invalida o cookie no servidor (não basta apagá-lo no browser)', async () => {
    const cookie = cookieDe(await registar());
    expect((await post('/api/auth/sair', {}, cookie)).statusCode).toBe(204);
    expect((await eu(cookie)).statusCode).toBe(401);
  });

  it('terminar sessão em todos os dispositivos invalida todas as sessões da conta, e só dessa conta', async () => {
    const telemovel = cookieDe(await registar());
    const computador = cookieDe(await post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE }));
    const outraPessoa = cookieDe(await registar('bruno@exemplo.ao', 'Bruno'));

    expect((await post('/api/auth/sair-de-todos', {}, computador)).statusCode).toBe(204);
    expect((await eu(telemovel)).statusCode).toBe(401);
    expect((await eu(computador)).statusCode).toBe(401);
    expect((await eu(outraPessoa)).statusCode).toBe(200);
  });

  it('sessões expiradas não são aceites', async () => {
    const cookie = cookieDe(await registar());
    await base.pool.query("update sessions set expires_at = now() - interval '1 second'");
    expect((await eu(cookie)).statusCode).toBe(401);
  });

  it('o uso da conta renova o prazo da sessão, na base de dados e no cookie', async () => {
    const cookie = cookieDe(await registar());
    await base.pool.query("update sessions set last_seen_at = now() - interval '2 hours', expires_at = now() + interval '1 day'");
    const r = await eu(cookie);
    expect(r.statusCode).toBe(200);
    const renovado = r.cookies.find((k) => k.name === 'eveni_sessao')!;
    expect(renovado.expires!.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    const { rows } = await base.pool.query("select expires_at > now() + interval '29 days' as renovada from sessions");
    expect(rows[0].renovada).toBe(true);
  });

  it('entrar com outra conta no mesmo browser termina a sessão anterior', async () => {
    const daAna = cookieDe(await registar());
    await registar('bruno@exemplo.ao', 'Bruno');
    const r = await post('/api/auth/entrar', { email: 'bruno@exemplo.ao', palavraPasse: PALAVRA_PASSE }, daAna);
    expect(r.statusCode).toBe(200);
    expect((await eu(daAna)).statusCode).toBe(401);
  });

  it('a limpeza periódica apaga sessões expiradas e contadores antigos, e mais nada', async () => {
    const valida = cookieDe(await registar());
    await registar('bruno@exemplo.ao', 'Bruno');
    await base.pool.query("update sessions set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = 'bruno@exemplo.ao')");
    await base.pool.query("insert into rate_limits values ('antigo', 3, now() - interval '2 days')");
    expect(await limparExpirados(base.pool)).toEqual({ sessoes: 1, tentativas: 1, ligacoes: 0, contas: 0 });
    expect((await eu(valida)).statusCode).toBe(200);
  });

  it('a base de dados guarda só o hash do token, nunca o token', async () => {
    const r = await registar();
    const token = r.cookies.find((k) => k.name === 'eveni_sessao')!.value;
    const { rows } = await base.pool.query('select token_hash from sessions');
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('as respostas nunca expõem hashes nem tokens', async () => {
    const r = await registar();
    const resposta = (await eu(cookieDe(r))).body;
    expect(resposta).not.toMatch(/argon2|password|hash|token/i);
  });
});

describe('protecção contra pedidos forjados (CSRF)', () => {
  it('recusa pedidos que alteram dados sem cabeçalho Origin', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/registo', payload: { nome: 'A', email: 'a@b.ao', palavraPasse: PALAVRA_PASSE } });
    expect(r.statusCode).toBe(403);
  });

  it.each(['/api//auth/sair-de-todos', '//api/auth/sair-de-todos', '/api/auth/sair-de-todos?x=1', '/qualquer-coisa'])(
    'a verificação de origem não depende da forma do caminho (%s)',
    async (url) => {
      const cookie = cookieDe(await registar());
      const r = await app.inject({ method: 'POST', url, headers: { origin: 'https://site-malicioso.example', cookie } });
      expect(r.statusCode).toBe(403);
      expect((await eu(cookie)).statusCode).toBe(200);
    },
  );

  it('recusa pedidos vindos de outro site', async () => {
    const cookie = cookieDe(await registar());
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/sair-de-todos',
      headers: { origin: 'https://site-malicioso.example', cookie },
    });
    expect(r.statusCode).toBe(403);
    expect((await eu(cookie)).statusCode).toBe(200);
  });
});
