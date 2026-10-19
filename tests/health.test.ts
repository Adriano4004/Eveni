import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp, eRotaDeEcra } from '../src/server/app.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { configTeste, URL_BD_TESTE } from './ajuda.js';

describe('GET /health', () => {
  const base = criarBaseDeDados(URL_BD_TESTE);

  beforeAll(async () => {
    await aplicarMigracoes(base, 'drizzle');
  });
  afterAll(async () => {
    await base.fechar();
  });

  it('responde 200 quando a base de dados está acessível', async () => {
    const app = await criarApp({ config: configTeste(), base });
    const resposta = await app.inject({ method: 'GET', url: '/health' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ estado: 'ok', baseDeDados: 'ok', ambiente: 'local' });
    await app.close();
  });

  it('responde 503 sem expor detalhes quando a base de dados falha', async () => {
    const baseEmBaixo = criarBaseDeDados('postgres://ninguem:errada@127.0.0.1:1/nada');
    const app = await criarApp({ config: configTeste(), base: baseEmBaixo });
    const resposta = await app.inject({ method: 'GET', url: '/health' });
    expect(resposta.statusCode).toBe(503);
    expect(resposta.body).not.toMatch(/ECONNREFUSED|ninguem|errada|stack/i);
    await app.close();
    await baseEmBaixo.fechar();
  });

  it('as migrações podem correr duas vezes sem erro', async () => {
    await expect(aplicarMigracoes(base, 'drizzle')).resolves.toBeUndefined();
  });
});

describe('cabeçalhos de segurança', () => {
  const base = criarBaseDeDados(URL_BD_TESTE);
  afterAll(async () => {
    await base.fechar();
  });

  it('envia CSP, HSTS (fora do ambiente local) e proíbe iframes', async () => {
    const app = await criarApp({ config: configTeste({ APP_ENV: 'staging' }), base });
    const resposta = await app.inject({ method: 'GET', url: '/health' });
    expect(resposta.headers['content-security-policy']).toContain("default-src 'self'");
    expect(resposta.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(resposta.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    await app.close();
  });

  it('rotas desconhecidas da API respondem 404 em português', async () => {
    const app = await criarApp({ config: configTeste(), base });
    const resposta = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().mensagem).toBe('Página não encontrada.');
    await app.close();
  });
});

describe('respostas de erro', () => {
  const base = criarBaseDeDados(URL_BD_TESTE);
  afterAll(async () => {
    await base.fechar();
  });

  it('erros do Fastify (ex.: JSON mal formado) respondem em português, sem detalhes internos', async () => {
    const app = await criarApp({ config: configTeste(), base });
    app.post('/api/eco', async () => ({ ok: true }));
    const resposta = await app.inject({ method: 'POST', url: '/api/eco', headers: { 'content-type': 'application/json' }, payload: '{mal' });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({ mensagem: 'O pedido não é válido.' });
    await app.close();
  });

  it('erros internos não expõem a mensagem original', async () => {
    const app = await criarApp({ config: configTeste(), base });
    app.get('/api/rebenta', async () => {
      throw new Error('segredo da base de dados');
    });
    const resposta = await app.inject({ method: 'GET', url: '/api/rebenta' });
    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('segredo');
    await app.close();
  });

  it('o IP do cliente não pode ser falsificado com X-Forwarded-For', async () => {
    const app = await criarApp({ config: configTeste(), base });
    app.get('/api/ip', async (pedido) => ({ ip: pedido.ip }));
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/ip',
      remoteAddress: '10.0.0.1',
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
    });
    // Só o último salto (o proxy do Railway) é de confiança.
    expect(resposta.json().ip).toBe('203.0.113.9');
    await app.close();
  });
});

describe('rotas de ecrã', () => {
  it.each([
    ['GET', '/', true],
    ['GET', '/projectos/12', true],
    ['HEAD', '/entrar?x=1', true],
    ['GET', '/assets/antigo-abc123.js', false],
    ['GET', '/api', false],
    ['GET', '/api?x=1', false],
    ['GET', '/api/projectos', false],
    ['POST', '/entrar', false],
  ])('%s %s → %s', (metodo, url, esperado) => {
    expect(eRotaDeEcra(metodo, url)).toBe(esperado);
  });
});

describe('migrações em paralelo', () => {
  it('duas instâncias a arrancar ao mesmo tempo não falham', async () => {
    const a = criarBaseDeDados(URL_BD_TESTE);
    const b = criarBaseDeDados(URL_BD_TESTE);
    await expect(Promise.all([aplicarMigracoes(a, 'drizzle'), aplicarMigracoes(b, 'drizzle')])).resolves.toBeDefined();
    await a.fechar();
    await b.fechar();
  });
});
