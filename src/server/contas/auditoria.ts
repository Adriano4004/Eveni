import type pg from 'pg';

export type AccaoAuditada =
  | 'conta.registo'
  | 'sessao.entrar'
  | 'sessao.entrar_falhado'
  | 'sessao.bloqueada'
  | 'sessao.sair'
  | 'sessao.sair_todos';

export async function auditar(
  pool: pg.Pool | pg.PoolClient,
  accao: AccaoAuditada,
  dados: { utilizadorId?: string | null; ip?: string | null; detalhes?: Record<string, unknown> },
): Promise<void> {
  await pool.query('insert into audit_log (user_id, action, ip, details) values ($1, $2, $3, $4)', [
    dados.utilizadorId ?? null,
    accao,
    dados.ip ?? null,
    JSON.stringify(dados.detalhes ?? {}),
  ]);
}
