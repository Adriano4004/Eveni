import type pg from 'pg';

export type AccaoAuditada =
  | 'conta.registo'
  | 'conta.exportada'
  | 'conta.eliminada'
  | 'conta.dados_confirmacao_falhada'
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
  | 'sessao.sair_todos'
  | 'projecto.criado'
  | 'projecto.arquivado'
  | 'projecto.restaurado'
  | 'equipa.convite_criado'
  | 'equipa.convite_revogado'
  | 'equipa.convite_aceite'
  | 'equipa.membro_removido'
  | 'projecto.acesso_dado'
  | 'projecto.acesso_retirado';

export async function auditar(
  pool: pg.Pool | pg.PoolClient,
  accao: AccaoAuditada,
  // espacoId: o espaço de trabalho a que a acção diz respeito (aparece no registo que o dono vê).
  dados: { utilizadorId?: string | null; ip?: string | null; detalhes?: Record<string, unknown>; espacoId?: string },
): Promise<void> {
  await pool.query('insert into audit_log (user_id, action, ip, details, workspace_id) values ($1, $2, $3, $4, $5)', [
    dados.utilizadorId ?? null,
    accao,
    dados.ip ?? null,
    JSON.stringify(dados.detalhes ?? {}),
    dados.espacoId ?? null,
  ]);
}
