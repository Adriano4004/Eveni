import type { Config } from '../src/server/config.js';

// Base de dados de teste criada dentro da sessão / do CI. Nunca a de produção.
export const URL_BD_TESTE = process.env.TEST_DATABASE_URL ?? 'postgres://eveni:eveni@localhost:5432/eveni_test';

export const envValido = {
  NODE_ENV: 'test',
  APP_ENV: 'local',
  DATABASE_URL: URL_BD_TESTE,
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'x'.repeat(32),
};

export function configTeste(extra: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    APP_ENV: 'local',
    PORT: 0,
    DATABASE_URL: URL_BD_TESTE,
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: 'x'.repeat(32),
    ...extra,
  };
}
