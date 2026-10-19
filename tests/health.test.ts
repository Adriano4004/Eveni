import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/server/app.js';
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
