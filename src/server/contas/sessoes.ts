import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { VERSAO_TERMOS } from '../../shared/legal.js';
import type { Config } from '../config.js';
import { apagarContasPorConfirmar } from './eliminacao.js';

export const DURACAO_SESSAO_DIAS = 30;
// Renova o prazo da sessão no máximo uma vez por hora, para não escrever na base de dados a cada pedido.
const RENOVAR_APOS_MS = 60 * 60 * 1000;

export function nomeCookie(config: Config): string {
  // O prefixo __Host- obriga o browser a exigir Secure, Path=/ e nenhum Domain: o cookie não pode ser
  // definido por subdomínios. Só funciona em https, por isso não se usa no ambiente local.
  return config.APP_ENV === 'local' ? 'eveni_sessao' : '__Host-eveni_sessao';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function criarSessao(
  pool: pg.Pool | pg.PoolClient,
  config: Config,
  resposta: FastifyReply,
  utilizadorId: string,
  pedido: FastifyRequest,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000);
  await pool.query('insert into sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)', [
    hashToken(token),
    utilizadorId,
    expira,
    pedido.ip,
    (pedido.headers['user-agent'] ?? '').slice(0, 500),
  ]);
  definirCookie(config, resposta, token, expira);
}

// Opções comuns a todos os cookies do Eveni (sessão e entrada a meio do 2FA).
export function opcoesCookie(config: Config) {
  return { httpOnly: true, secure: config.APP_ENV !== 'local', sameSite: 'lax' as const, path: '/' };
}

function definirCookie(config: Config, resposta: FastifyReply, token: string, expira: Date) {
  resposta.setCookie(nomeCookie(config), token, { ...opcoesCookie(config), expires: expira });
}

export function apagarCookie(config: Config, resposta: FastifyReply) {
  resposta.clearCookie(nomeCookie(config), opcoesCookie(config));
}

export interface SessaoValida {
  tokenHash: string;
  utilizadorId: string;
  emailConfirmado: boolean;
  // Aceitou a versão actual dos termos (decisão 026).
  termosAceites: boolean;
}

// Lê o cookie e devolve a sessão se existir e não tiver expirado.
// Com `resposta`, renova o prazo na base de dados e no cookie (sessão deslizante).
export async function lerSessao(
  pool: pg.Pool,
  config: Config,
  pedido: FastifyRequest,
  resposta?: FastifyReply,
): Promise<SessaoValida | null> {
  const token = pedido.cookies[nomeCookie(config)];
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);
  const { rows } = await pool.query<{ user_id: string; last_seen_at: Date; email_confirmado: boolean; termos_aceites: boolean }>(
    `select s.user_id, s.last_seen_at, u.email_verified_at is not null as email_confirmado,
            u.terms_version is not distinct from $2 as termos_aceites
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash, VERSAO_TERMOS],
  );
  const linha = rows[0];
  if (!linha) return null;
  if (resposta && Date.now() - linha.last_seen_at.getTime() > RENOVAR_APOS_MS) {
    const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000);
    await pool.query('update sessions set last_seen_at = now(), expires_at = $2 where token_hash = $1', [tokenHash, expira]);
    // Sem isto, o browser apagava o cookie 30 dias depois da entrada, mesmo com uso diário.
    definirCookie(config, resposta, token, expira);
  }
  return { tokenHash, utilizadorId: linha.user_id, emailConfirmado: linha.email_confirmado, termosAceites: linha.termos_aceites };
}

export async function terminarSessao(pool: pg.Pool, tokenHash: string): Promise<void> {
  await pool.query('delete from sessions where token_hash = $1', [tokenHash]);
}

// Termina as sessões e também as entradas a meio (palavra-passe certa, à espera do código do 2FA).
export async function terminarTodasAsSessoes(pool: pg.Pool | pg.PoolClient, utilizadorId: string): Promise<number> {
  await pool.query('delete from login_challenges where user_id = $1', [utilizadorId]);
  const { rowCount } = await pool.query('delete from sessions where user_id = $1', [utilizadorId]);
  return rowCount ?? 0;
}

// Apaga sessões expiradas e contadores de tentativas antigos. Corre periodicamente (ver index.ts).
export async function limparExpirados(pool: pg.Pool): Promise<{ sessoes: number; tentativas: number; ligacoes: number; contas: number }> {
  const sessoes = await pool.query('delete from sessions where expires_at < now()');
  // Nenhuma janela de limitação passa de 1 hora: um dia de margem chega.
  const tentativas = await pool.query("delete from rate_limits where window_start < now() - interval '1 day'");
  // Ligações de e-mail expiradas ou já usadas há mais de um dia deixam de ter utilidade.
  const ligacoes = await pool.query(
    "delete from email_tokens where expires_at < now() - interval '1 day' or used_at < now() - interval '1 day'",
  );
  await pool.query('delete from login_challenges where expires_at < now()');
  // Convites aceites, revogados ou expirados há mais de 30 dias: o e-mail convidado é um dado de terceiro.
  await pool.query(
    "delete from invitations where coalesce(accepted_at, revoked_at, expires_at) < now() - interval '30 days' and (accepted_at is not null or revoked_at is not null or expires_at < now())",
  );
  const contas = await apagarContasPorConfirmar({ pool });
  return { sessoes: sessoes.rowCount ?? 0, tentativas: tentativas.rowCount ?? 0, ligacoes: ligacoes.rowCount ?? 0, contas };
}
