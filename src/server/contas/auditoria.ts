import type pg from 'pg';

export type AccaoAuditada =
  | 'conta.registo'
  | 'conta.email_confirmado'
  | 'conta.confirmacao_reenviada'
  | 'conta.recuperacao_pedida'
  | 'conta.recuperacao_limitada'
  | 'conta.palavra_passe_redefinida'
  | 'conta.palavra_passe_mudada'
  | 'conta.palavra_passe_mudar_falhado'
  | 'sessao.entrar'
  | 'sessao.2fa_falhado'
  | 'sessao.2fa_pedido'
  | 'conta.2fa_activado'
  | 'conta.2fa_desactivado'
  | 'conta.2fa_codigos_novos'
  | 'conta.2fa_confirmacao_falhada'
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
