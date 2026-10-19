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
  //
  // Exige sessão na própria conta: sem isto, alguém podia registar-se com o e-mail de outra pessoa,
  // esperar que ela carregasse na ligação e ficar com uma conta confirmada nesse e-mail. Quem recebe
  // o e-mail sem ter criado a conta não sabe a palavra-passe, por isso não consegue confirmar.
  app.post('/api/auth/confirmar-email', { preHandler: guardas.exigirSessao }, async (pedido) => {
    await limitar(pool, `confirmar-ip:${pedido.ip}`, LIMITES.confirmarPorIp);
    const { token } = validar(corpoConfirmar, pedido.body);
    const utilizadorSessao = pedido.sessao!.utilizadorId;

    // Ligação válida mas de outra conta: avisar, sem a gastar.
    const { rows: donos } = await pool.query<{ user_id: string }>(
      "select user_id from email_tokens where token_hash = $1 and purpose = 'confirmar_email' and used_at is null and expires_at > now()",
      [hashToken(token)],
    );
    if (donos[0] && donos[0].user_id !== utilizadorSessao) throw new ErroHttp(400, mensagens.contas.ligacaoDeOutraConta);

    // Marca a ligação como usada e confirma o e-mail numa só operação: pedidos repetidos ou em
    // paralelo com a mesma ligação não a conseguem usar duas vezes.
    const { rows } = await pool.query<{ user_id: string }>(
      `with usada as (
         update email_tokens set used_at = now()
          where token_hash = $1 and user_id = $2 and purpose = 'confirmar_email' and used_at is null and expires_at > now()
          returning user_id
       )
       update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
        where id = (select user_id from usada)
        returning id as user_id`,
      [hashToken(token), utilizadorSessao],
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
    let envio: { email: string; token: string } | undefined;
    try {
      await cliente.query('begin');
      const { rows } = await cliente.query<{ email: string; confirmado: boolean }>(
        'select email, email_verified_at is not null as confirmado from users where id = $1 for update',
        [utilizadorId],
      );
      const utilizador = rows[0];
      if (utilizador && !utilizador.confirmado) {
        envio = { email: utilizador.email, token: await criarTokenConfirmacao(cliente, utilizadorId) };
        await auditar(cliente, 'conta.confirmacao_reenviada', { utilizadorId, ip: pedido.ip });
      }
      await cliente.query('commit');
    } catch (erro) {
      await cliente.query('rollback');
      throw erro;
    } finally {
      cliente.release();
    }
    if (envio) enviarEmail(emailConfirmacao(envio.email, urlConfirmacao(config, envio.token)));
    return resposta.code(204).send();
  });
}
