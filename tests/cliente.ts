// Funções de apoio para testes que falam com a API como um browser faria.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { criarApp } from '../src/server/app.js';
import type { Config } from '../src/server/config.js';
import type { BaseDeDados } from '../src/server/db/index.js';
import type { MensagemEmail } from '../src/server/email/index.js';
import { configTeste } from './ajuda.js';

export const ORIGEM = 'http://localhost:3000';
export const PALAVRA_PASSE = 'Kizomba-2026-evento';

// Com os ecrãs compilados, como em produção (a ordem de registo dos plugins já causou um erro).
const pastaWeb = mkdtempSync(join(tmpdir(), 'eveni-web-'));
writeFileSync(join(pastaWeb, 'index.html'), '<!doctype html><title>Eveni</title>');

export function cookieDe(resposta: LightMyRequestResponse): string {
  const c = resposta.cookies.find((k) => k.name.endsWith('eveni_sessao'));
  if (!c) throw new Error('sem cookie de sessão');
  return `${c.name}=${c.value}`;
}

// App de teste com os e-mails guardados numa lista em vez de enviados.
export async function criarCliente(base: BaseDeDados, extra: Partial<Config> = {}) {
  const emails: MensagemEmail[] = [];
  const app: FastifyInstance = await criarApp({ config: configTeste(extra), base, pastaWeb, enviarEmail: (m) => emails.push(m) });

  const post = (url: string, payload: object = {}, cookie?: string, ip = '198.51.100.1') =>
    app.inject({ method: 'POST', url, payload, remoteAddress: ip, headers: { origin: ORIGEM, ...(cookie ? { cookie } : {}) } });

  const get = (url: string, cookie?: string) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

  return {
    app,
    emails,
    post,
    get,
    eu: (cookie?: string) => get('/api/auth/eu', cookie),
    registar: (email = 'ana@exemplo.ao', nome = 'Ana Domingos') => post('/api/auth/registo', { nome, email, palavraPasse: PALAVRA_PASSE }),
    // Extrai o token da ligação de confirmação do último e-mail enviado.
    tokenDoUltimoEmail(): string {
      const texto = emails.at(-1)?.texto ?? '';
      const token = /confirmar-email\?token=([\w%-]+)/.exec(texto)?.[1];
      if (!token) throw new Error('nenhuma ligação de confirmação no último e-mail');
      return decodeURIComponent(token);
    },
  };
}
