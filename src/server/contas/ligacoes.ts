import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { hashToken } from './sessoes.js';

// Ligações de uso único enviadas por e-mail. A base de dados guarda só o hash do token.
export type Finalidade = 'confirmar_email' | 'recuperar_palavra_passe';

// Cria uma ligação nova e invalida as anteriores da mesma finalidade ainda por usar.
export async function criarLigacao(
  cliente: pg.Pool | pg.PoolClient,
  utilizadorId: string,
  finalidade: Finalidade,
  validadeMinutos: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await cliente.query('delete from email_tokens where user_id = $1 and purpose = $2 and used_at is null', [utilizadorId, finalidade]);
  await cliente.query(
    `insert into email_tokens (token_hash, user_id, purpose, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [hashToken(token), utilizadorId, finalidade, validadeMinutos],
  );
  return token;
}

// Marca a ligação como usada, numa só operação (pedidos repetidos ou em paralelo não a usam duas
// vezes). Devolve o utilizador a que pertence, ou null se for inválida, expirada ou já usada.
export async function gastarLigacao(
  cliente: pg.Pool | pg.PoolClient,
  token: string,
  finalidade: Finalidade,
  utilizadorId?: string,
): Promise<string | null> {
  const { rows } = await cliente.query<{ user_id: string }>(
    `update email_tokens set used_at = now()
      where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
        and ($3::uuid is null or user_id = $3::uuid)
      returning user_id`,
    [hashToken(token), finalidade, utilizadorId ?? null],
  );
  return rows[0]?.user_id ?? null;
}

// Só lê: a ligação existe, é desta finalidade, não foi usada e não expirou.
export async function ligacaoValida(cliente: pg.Pool | pg.PoolClient, token: string, finalidade: Finalidade): Promise<string | null> {
  const { rows } = await cliente.query<{ user_id: string }>(
    'select user_id from email_tokens where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()',
    [hashToken(token), finalidade],
  );
  return rows[0]?.user_id ?? null;
}
