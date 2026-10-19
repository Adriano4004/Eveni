import { describe, expect, it } from 'vitest';
import { ConfigInvalida, lerConfig } from '../src/server/config.js';
import { envValido } from './ajuda.js';

function problemas(env: Record<string, string | undefined>): string[] {
  try {
    lerConfig(env);
  } catch (erro) {
    if (erro instanceof ConfigInvalida) return erro.problemas;
    throw erro;
  }
  return [];
}

describe('validação da configuração no arranque', () => {
  it('aceita uma configuração completa e aplica valores por omissão', () => {
    const config = lerConfig(envValido);
    expect(config.PORT).toBe(3000);
    expect(config.APP_ENV).toBe('local');
  });

  it('recusa arrancar sem APP_URL (falha da versão anterior: links de e-mail com localhost)', () => {
    const { APP_URL: _, ...semUrl } = envValido;
    expect(problemas(semUrl).join(' ')).toContain('APP_URL');
  });

  it('recusa arrancar sem APP_ENV (não pode escapar às verificações de produção)', () => {
    const { APP_ENV: _, ...semAmbiente } = envValido;
    expect(problemas(semAmbiente).join(' ')).toContain('APP_ENV');
  });

  it('trata variáveis vazias como em falta', () => {
    expect(problemas({ ...envValido, APP_URL: '' }).join(' ')).toContain('APP_URL');
  });

  it('recusa APP_URL com barra final', () => {
    expect(problemas({ ...envValido, APP_URL: 'https://eveni.ao/' }).join(' ')).toContain('"/"');
  });

  it('recusa SESSION_SECRET curto', () => {
    expect(problemas({ ...envValido, SESSION_SECRET: 'curto' }).join(' ')).toContain('32 caracteres');
  });

  it('recusa DATABASE_URL que não seja PostgreSQL', () => {
    expect(problemas({ ...envValido, DATABASE_URL: 'mysql://x' }).join(' ')).toContain('DATABASE_URL');
  });

  it('lista todos os problemas de uma vez', () => {
    expect(problemas({}).length).toBeGreaterThanOrEqual(3);
  });

  it('em produção exige e-mail configurado e https', () => {
    const lista = problemas({ ...envValido, APP_ENV: 'production' }).join(' ');
    expect(lista).toContain('RESEND_API_KEY');
    expect(lista).toContain('EMAIL_FROM');
    expect(lista).toContain('https://');
  });

  it('em staging deixa arrancar sem e-mail (domínio ainda por configurar)', () => {
    expect(problemas({ ...envValido, APP_ENV: 'staging' })).toEqual([]);
  });
});
