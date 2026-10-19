import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import type { BaseDeDados } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailConfirmacao } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import type { criarGuardas } from './acesso.js';
import { auditar } from './auditoria.js';
import { hashToken } from './sessoes.js';

const VALIDADE_HORAS = 48;

// Cria uma ligação de confirmação nova e invalida as anteriores ainda por usar.
export async function criarTokenConfirmacao(cliente: pg.Pool | pg.PoolClient, utilizadorId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await cliente.query("delete from email_tokens where user_id = $1 and purpose = 'confirmar_email' and used_at is null", [utilizadorId]);
  await cliente.query(
    `insert into email_tokens (token_hash, user_id, purpose, expires_at)
     values ($1, $2, 'confirmar_email', now() + make_interval(hours => $3))`,
    [hashToken(token), utilizadorId, VALIDADE_HORAS],
  );
  return token;
}

export function urlConfirmacao(config: Config, token: string): string {
  return `${config.APP_URL}/confirmar-email?token=${encodeURIComponent(token)}`;
}

const corpoConfirmar = z.object({ token: z.string().min(1).max(100) });

export function registarRotasConfirmacao(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;

  // POST e não GET: alguns programas de e-mail e antivírus abrem as ligações sozinhos para as verificar,
  // e isso não pode gastar a ligação. O ecrã /confirmar-email faz este pedido quando a pessoa a abre.
  // Não exige sessão: a ligação pode ser aberta noutro aparelho.
  app.post('/api/auth/confirmar-email', async (pedido) => {
    await limitar(pool, `confirmar-ip:${pedido.ip}`, LIMITES.confirmarPorIp);
    const { token } = validar(corpoConfirmar, pedido.body);

    // Marca a ligação como usada e confirma o e-mail numa só operação: pedidos repetidos ou em
    // paralelo com a mesma ligação não a conseguem usar duas vezes.
    const { rows } = await pool.query<{ user_id: string }>(
      `with usada as (
         update email_tokens set used_at = now()
          where token_hash = $1 and purpose = 'confirmar_email' and used_at is null and expires_at > now()
          returning user_id
       )
       update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
        where id = (select user_id from usada)
        returning id as user_id`,
      [hashToken(token)],
    );
    const utilizadorId = rows[0]?.user_id;
    if (!utilizadorId) throw new ErroHttp(400, mensagens.contas.ligacaoInvalida);
    await auditar(pool, 'conta.email_confirmado', { utilizadorId, ip: pedido.ip });
    return { confirmado: true };
  });

  app.post('/api/auth/reenviar-confirmacao', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const { utilizadorId, emailConfirmado } = pedido.sessao!;
    // Já confirmado: nada a enviar, e não gasta o limite de reenvios.
    if (emailConfirmado) return resposta.code(204).send();
    await limitar(pool, `reenviar:${utilizadorId}`, LIMITES.reenviarConfirmacao);

    // Numa transacção com a linha do utilizador bloqueada: dois reenvios em simultâneo não podem
    // deixar duas ligações válidas (só a mais recente deve valer).
    const cliente = await pool.connect();
    let envio: { email: string; nome: string; token: string } | undefined;
    try {
      await cliente.query('begin');
      const { rows } = await cliente.query<{ email: string; name: string; confirmado: boolean }>(
        'select email, name, email_verified_at is not null as confirmado from users where id = $1 for update',
        [utilizadorId],
      );
      const utilizador = rows[0];
      if (utilizador && !utilizador.confirmado) {
        envio = { email: utilizador.email, nome: utilizador.name, token: await criarTokenConfirmacao(cliente, utilizadorId) };
        await auditar(cliente, 'conta.confirmacao_reenviada', { utilizadorId, ip: pedido.ip });
      }
      await cliente.query('commit');
    } catch (erro) {
      await cliente.query('rollback');
      throw erro;
    } finally {
      cliente.release();
    }
    if (envio) enviarEmail(emailConfirmacao(envio.email, envio.nome, urlConfirmacao(config, envio.token)));
    return resposta.code(204).send();
  });
}
