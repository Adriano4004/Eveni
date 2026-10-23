import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type CodigoPlano, type EspacoAdmin, mudarPlano, pesquisaAdmin } from '../../shared/esquemas.js';
import { LIMITE_PESSOAS } from '../../shared/equipa.js';
import { mensagens } from '../../shared/mensagens.js';
import { LIMITE_PROJECTOS } from '../../shared/projectos.js';
import type { Config } from '../config.js';
import { auditar } from '../contas/auditoria.js';
import type { criarGuardas } from '../contas/acesso.js';
import type { BaseDeDados } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailPlanoAlterado } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';

const m = mensagens.admin;

// Até haver pagamentos na aplicação, o plano de cada espaço muda-se aqui (decisão 027). Só para os e-mails
// em ADMINS, e só com a verificação em dois passos activa: a palavra-passe sozinha não chega.
export function registarRotasAdmin(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;

  async function exigirAdmin(pedido: FastifyRequest, resposta: FastifyReply) {
    await guardas.exigirSessao(pedido, resposta);
    const { rows } = await pool.query<{ email: string; dois_factores: boolean }>(
      'select email, totp_enabled_at is not null as dois_factores from users where id = $1',
      [pedido.sessao!.utilizadorId],
    );
    // Para quem não é administrador, a administração não existe (a mesma resposta que um endereço errado).
    if (!rows[0] || !config.ADMINS.includes(rows[0].email)) throw new ErroHttp(404, mensagens.erros.naoEncontrado);
    if (!rows[0].dois_factores) throw new ErroHttp(403, m.precisaDoisFactores);
  }

  app.get('/api/admin/espacos', { preHandler: exigirAdmin }, async (pedido): Promise<EspacoAdmin[]> => {
    const { pesquisa } = validar(pesquisaAdmin, pedido.query);
    // Os caracteres especiais do LIKE (% e _) contam como texto: a pesquisa é sempre "contém".
    const padrao = pesquisa ? `%${pesquisa.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows } = await pool.query<{
      id: string;
      name: string;
      plan_code: CodigoPlano;
      plan_started_at: Date;
      dono_nome: string | null;
      dono_email: string | null;
      projectos: number;
      membros: number;
    }>(
      `select w.id, w.name, w.plan_code, w.plan_started_at, u.name as dono_nome, u.email as dono_email,
              (select count(*)::int from projects p where p.workspace_id = w.id) as projectos,
              (select count(*)::int from workspace_members x where x.workspace_id = w.id) as membros
         from workspaces w
         left join workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
         left join users u on u.id = wm.user_id
        where $1::text is null or u.email ilike $1 or w.name ilike $1
        order by w.created_at desc
        limit 50`,
      [padrao],
    );
    return rows.map((l) => ({
      id: l.id,
      nome: l.name,
      dono: l.dono_email ? { nome: l.dono_nome!, email: l.dono_email } : null,
      plano: l.plan_code,
      planoDesde: l.plan_started_at.toISOString(),
      projectos: l.projectos,
      membros: l.membros,
      acimaDoLimite: acimaDoLimite(l.plan_code, l.projectos, l.membros),
    }));
  });

  app.post<{ Params: { id: string } }>('/api/admin/espacos/:id/plano', { preHandler: exigirAdmin }, async (pedido) => {
    const { plano } = validar(mudarPlano, pedido.body);
    const id = pedido.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroHttp(404, m.espacoInexistente);
    const cliente = await pool.connect();
    let resultado: { nome: string; dono: string | null; projectos: number; membros: number } | null = null;
    try {
      await cliente.query('begin');
      // Bloqueia o espaço: a mudança não se cruza com a criação de um projecto ou um convite (que lêem o plano).
      const { rows } = await cliente.query<{ plan_code: CodigoPlano; name: string; dono: string | null; projectos: number; membros: number }>(
        `select w.plan_code, w.name,
                (select u.email from workspace_members wm join users u on u.id = wm.user_id
                  where wm.workspace_id = w.id and wm.role = 'owner' limit 1) as dono,
                (select count(*)::int from projects p where p.workspace_id = w.id) as projectos,
                (select count(*)::int from workspace_members x where x.workspace_id = w.id) as membros
           from workspaces w where w.id = $1 for update of w`,
        [id],
      );
      const espaco = rows[0];
      if (!espaco) throw new ErroHttp(404, m.espacoInexistente);
      if (espaco.plan_code !== plano) {
        // O período do plano começa no dia da mudança (decisão 027).
        await cliente.query('update workspaces set plan_code = $2, plan_started_at = now() where id = $1', [id, plano]);
        await auditar(cliente, 'admin.plano_alterado', {
          utilizadorId: pedido.sessao!.utilizadorId,
          ip: pedido.ip,
          espacoId: id,
          detalhes: { de: espaco.plan_code, para: plano },
        });
        resultado = { nome: espaco.name, dono: espaco.dono, projectos: espaco.projectos, membros: espaco.membros };
      }
      await cliente.query('commit');
    } catch (erro) {
      await cliente.query('rollback');
      throw erro;
    } finally {
      cliente.release();
    }

    // Depois do commit, sem bloquear a resposta (as falhas ficam nos logs).
    if (resultado?.dono) {
      const acima = acimaDoLimite(plano, resultado.projectos, resultado.membros);
      enviarEmail(emailPlanoAlterado(resultado.dono, config.APP_URL, resultado.nome, mensagens.planos[plano], acima));
    }
    return { plano, mudou: resultado !== null };
  });
}

// O espaço tem mais projectos ou membros do que o plano permite (ex.: desceu de Empresarial para Singular).
// Mantém tudo; só não pode criar mais (decisão 027).
export function acimaDoLimite(plano: CodigoPlano, projectos: number, membros: number): boolean {
  const lp = LIMITE_PROJECTOS[plano];
  const lm = LIMITE_PESSOAS[plano];
  return (lp !== null && projectos > lp) || (lm !== null && membros > lm);
}
