import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { DIAS_VALIDADE_CONVITE, type ConviteCriado, type Equipa, type InfoConvite, LIMITE_PESSOAS } from '../../shared/equipa.js';
import { type CodigoPlano, convidar, tokenConvite } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import type { criarGuardas } from '../contas/acesso.js';
import { auditar } from '../contas/auditoria.js';
import { hashToken } from '../contas/sessoes.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { esconderEmail, type EnviarEmail } from '../email/index.js';
import { emailConvite } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar, registarTentativa } from '../seguranca/limites.js';

// Equipa do espaço de trabalho e convites (decisão 017).
// Gerir a equipa é sempre sobre o espaço de que a pessoa é DONA, tirado da sessão: nenhum pedido indica
// um espaço, por isso não há como apontar para o espaço de outra pessoa.

const m = mensagens.equipa;
const id = z.object({ id: z.uuid() });

interface Espaco {
  id: string;
  name: string;
  plan_code: CodigoPlano;
}

// O espaço de que a pessoa é dona. Nas alterações, fica bloqueado até ao fim da transacção (contagens do
// limite do plano).
async function espacoDoDono(cliente: pg.PoolClient | pg.Pool, utilizadorId: string, bloquear = true): Promise<Espaco> {
  const { rows } = await cliente.query<Espaco>(
    `select w.id, w.name, w.plan_code from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = $1 and wm.role = 'owner'
      order by wm.created_at limit 1
      ${bloquear ? 'for update of w' : ''}`,
    [utilizadorId],
  );
  if (!rows[0]) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);
  return rows[0];
}

// Convite por aceitar, não revogado e dentro do prazo. `t` é o prefixo da tabela na consulta (fixo, nunca do pedido).
const valido = (t = '') => `${t}accepted_at is null and ${t}revoked_at is null and ${t}expires_at > now()`;

// Membros mais convites por aceitar: os lugares ocupados no limite do plano.
async function lugaresOcupados(cliente: pg.PoolClient | pg.Pool, espacoId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    `select (select count(*) from workspace_members where workspace_id = $1)
          + (select count(*) from invitations where workspace_id = $1 and ${valido()}) as n`,
    [espacoId],
  );
  return Number(rows[0]!.n);
}

export function registarRotasEquipa(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;

  // A equipa (com e-mails): só o dono a vê, porque é sempre a do seu próprio espaço.
  app.get('/api/equipa', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Equipa> => {
    const espaco = await espacoDoDono(pool, pedido.sessao!.utilizadorId, false);
    const { rows: membros } = await pool.query<{ id: string; name: string; email: string; role: 'owner' | 'member'; created_at: Date }>(
      `select u.id, u.name, u.email, wm.role, wm.created_at from workspace_members wm join users u on u.id = wm.user_id
        where wm.workspace_id = $1 order by (wm.role = 'owner') desc, u.name, u.id`,
      [espaco.id],
    );
    const { rows: convites } = await pool.query<{ id: string; email: string; created_at: Date; expires_at: Date }>(
      `select id, email, created_at, expires_at from invitations where workspace_id = $1 and ${valido()} order by created_at`,
      [espaco.id],
    );
    return {
      espaco: espaco.name,
      plano: espaco.plan_code,
      limite: LIMITE_PESSOAS[espaco.plan_code],
      ocupados: membros.length + convites.length,
      membros: membros.map((x) => ({ id: x.id, nome: x.name, email: x.email, papel: x.role, desde: x.created_at.toISOString() })),
      convites: convites.map((x) => ({ id: x.id, email: x.email, criadoEm: x.created_at.toISOString(), expiraEm: x.expires_at.toISOString() })),
    };
  });

  app.post('/api/equipa/convites', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `convidar:${utilizadorId}`, LIMITES.convidarPorConta);
    const { email } = validar(convidar, pedido.body);
    const token = randomBytes(32).toString('base64url');

    const criado = await emTransaccao(pool, async (cliente) => {
      const espaco = await espacoDoDono(cliente, utilizadorId);
      const limite = LIMITE_PESSOAS[espaco.plan_code];
      if (limite === 1) throw new ErroHttp(403, m.semColaboracao);

      const { rows: dono } = await cliente.query<{ name: string; email: string }>('select name, email from users where id = $1', [utilizadorId]);
      if (dono[0]!.email === email) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { email: m.proprioEmail });
      const { rows: jaMembro } = await cliente.query(
        'select 1 from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = $1 and u.email = $2',
        [espaco.id, email],
      );
      if (jaMembro.length > 0) throw new ErroHttp(409, mensagens.erros.pedidoInvalido, { email: m.jaMembro });

      // Um convite novo para o mesmo e-mail substitui o anterior (a ligação antiga deixa de funcionar).
      await cliente.query(`update invitations set revoked_at = now() where workspace_id = $1 and email = $2 and ${valido()}`, [
        espaco.id,
        email,
      ]);
      if (limite !== null && (await lugaresOcupados(cliente, espaco.id)) >= limite) throw new ErroHttp(409, m.limite(limite));

      const { rows } = await cliente.query<{ id: string; created_at: Date; expires_at: Date }>(
        `insert into invitations (workspace_id, email, token_hash, created_by, expires_at)
         values ($1, $2, $3, $4, now() + make_interval(days => $5)) returning id, created_at, expires_at`,
        [espaco.id, email, hashToken(token), utilizadorId, DIAS_VALIDADE_CONVITE],
      );
      // Sem o e-mail convidado na auditoria: é um dado de terceiro.
      await auditar(cliente, 'equipa.convite_criado', { utilizadorId, ip: pedido.ip, detalhes: { conviteId: rows[0]!.id } });
      return { ...rows[0]!, quem: dono[0]!.name, espaco: espaco.name, espacoId: espaco.id };
    });

    const ligacao = `${config.APP_URL}/convite?token=${encodeURIComponent(token)}`;
    // Por e-mail também (sem domínio configurado fica só nos logs); o dono partilha a ligação por WhatsApp.
    // Com limites diários, para os convites nunca gastarem a quota dos e-mails de conta.
    const porEspaco = await registarTentativa(pool, `emails-convite:${criado.espacoId}`, LIMITES.emailsConvitePorEspaco.janela);
    const total = porEspaco <= LIMITES.emailsConvitePorEspaco.max ? await registarTentativa(pool, 'emails-convite:total', LIMITES.emailsConviteTotal.janela) : 0;
    if (porEspaco <= LIMITES.emailsConvitePorEspaco.max && total <= LIMITES.emailsConviteTotal.max) {
      enviarEmail(emailConvite(email, ligacao, criado.quem, criado.espaco));
    } else {
      console.warn(`[email:limite] convite ${criado.id} não enviado por e-mail (limite diário de convites); fica a ligação`);
    }
    const corpo: ConviteCriado = {
      id: criado.id,
      email,
      criadoEm: criado.created_at.toISOString(),
      expiraEm: criado.expires_at.toISOString(),
      ligacao,
    };
    return resposta.code(201).header('cache-control', 'no-store').send(corpo);
  });

  app.post('/api/equipa/convites/:id/revogar', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = id.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.conviteNaoEncontrado);
    const { utilizadorId } = pedido.sessao!;
    await emTransaccao(pool, async (cliente) => {
      const espaco = await espacoDoDono(cliente, utilizadorId);
      const { rows } = await cliente.query(
        `update invitations set revoked_at = now() where id = $1 and workspace_id = $2 and ${valido()} returning id`,
        [parametros.data.id, espaco.id],
      );
      if (rows.length === 0) throw new ErroHttp(404, m.conviteNaoEncontrado);
      await auditar(cliente, 'equipa.convite_revogado', { utilizadorId, ip: pedido.ip, detalhes: { conviteId: parametros.data.id } });
    });
    return resposta.code(204).send();
  });

  // Retirar alguém da equipa: perde o acesso a todos os projectos do espaço e deixa de ser responsável
  // pelas tarefas desses projectos, tudo na mesma transacção.
  app.post('/api/equipa/membros/:id/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = id.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.membroNaoEncontrado);
    const membro = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await emTransaccao(pool, async (cliente) => {
      const espaco = await espacoDoDono(cliente, utilizadorId);
      const { rows } = await cliente.query(
        "delete from workspace_members where workspace_id = $1 and user_id = $2 and role = 'member' returning user_id",
        [espaco.id, membro],
      );
      // Inexistente, de outro espaço ou o próprio dono: a mesma resposta.
      if (rows.length === 0) throw new ErroHttp(404, m.membroNaoEncontrado);
      await cliente.query('delete from project_members where user_id = $1 and project_id in (select id from projects where workspace_id = $2)', [
        membro,
        espaco.id,
      ]);
      await cliente.query(
        'update tasks set assignee_id = null, updated_at = clock_timestamp() where assignee_id = $1 and project_id in (select id from projects where workspace_id = $2)',
        [membro, espaco.id],
      );
      await auditar(cliente, 'equipa.membro_removido', { utilizadorId, ip: pedido.ip, detalhes: { membroId: membro } });
    });
    return resposta.code(204).send();
  });

  // Quem abre a ligação vê de quem é o convite antes de entrar ou aceitar. Só com o token.
  app.post('/api/convites/ver', async (pedido): Promise<InfoConvite> => {
    await limitar(pool, `convites-ip:${pedido.ip}`, LIMITES.convitesPorIp);
    const { token } = validar(tokenConvite, pedido.body);
    const { rows } = await pool.query<{ espaco: string; quem: string | null; email: string; expires_at: Date }>(
      `select w.name as espaco, u.name as quem, i.email, i.expires_at
         from invitations i join workspaces w on w.id = i.workspace_id left join users u on u.id = i.created_by
        where i.token_hash = $1 and ${valido('i.')}`,
      [hashToken(token)],
    );
    const convite = rows[0];
    if (!convite) throw new ErroHttp(404, m.conviteInvalido);
    return { espaco: convite.espaco, convidadoPor: convite.quem ?? convite.espaco, email: esconderEmail(convite.email), expiraEm: convite.expires_at.toISOString() };
  });

  // Aceitar: com sessão na conta do e-mail convidado, já confirmado (prova que o e-mail é da pessoa).
  app.post('/api/convites/aceitar', { preHandler: guardas.exigirEmailConfirmado }, async (pedido) => {
    await limitar(pool, `convites-ip:${pedido.ip}`, LIMITES.convitesPorIp);
    const { token } = validar(tokenConvite, pedido.body);
    const { utilizadorId } = pedido.sessao!;

    return emTransaccao(pool, async (cliente) => {
      // Bloqueia primeiro o espaço e só depois o convite, pela mesma ordem de convidar e revogar
      // (ordens diferentes podiam bloquear-se mutuamente). Dois convites aceites ao mesmo tempo também
      // não passam ambos o limite do plano.
      const { rows: espacos } = await cliente.query<Espaco>(
        'select w.id, w.name, w.plan_code from workspaces w join invitations i on i.workspace_id = w.id where i.token_hash = $1 for update of w',
        [hashToken(token)],
      );
      const espaco = espacos[0];
      if (!espaco) throw new ErroHttp(404, m.conviteInvalido);
      const { rows } = await cliente.query<{ id: string; email: string }>(
        `select id, email from invitations where token_hash = $1 and workspace_id = $2 and ${valido()} for update`,
        [hashToken(token), espaco.id],
      );
      const convite = rows[0];
      if (!convite) throw new ErroHttp(404, m.conviteInvalido);
      const { rows: eu } = await cliente.query<{ email: string }>('select email from users where id = $1', [utilizadorId]);
      if (eu[0]?.email !== convite.email) throw new ErroHttp(403, m.conviteOutroEmail(esconderEmail(convite.email)));

      const { rows: jaMembro } = await cliente.query('select 1 from workspace_members where workspace_id = $1 and user_id = $2', [
        espaco.id,
        utilizadorId,
      ]);
      if (jaMembro.length === 0) {
        // O plano pode ter mudado desde o convite: contar os membros de novo.
        const limite = LIMITE_PESSOAS[espaco.plan_code];
        const { rows: n } = await cliente.query<{ n: number }>('select count(*)::int as n from workspace_members where workspace_id = $1', [
          espaco.id,
        ]);
        if (limite !== null && n[0]!.n >= limite) throw new ErroHttp(409, m.equipaCompleta);
        // Segunda salvaguarda: ao entrar (ou voltar) para a equipa, nenhum acesso antigo a projectos deste espaço
        // se mantém. Quem entra não vê nenhum projecto até o dono lhe dar acesso (decisão 017).
        await cliente.query('delete from project_members where user_id = $1 and project_id in (select id from projects where workspace_id = $2)', [
          utilizadorId,
          espaco.id,
        ]);
        await cliente.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [espaco.id, utilizadorId]);
      }
      await cliente.query('update invitations set accepted_at = now(), accepted_by = $2 where id = $1', [convite.id, utilizadorId]);
      await auditar(cliente, 'equipa.convite_aceite', { utilizadorId, ip: pedido.ip, detalhes: { conviteId: convite.id, espacoId: espaco.id } });
      return { espaco: espaco.name };
    });
  });
}
