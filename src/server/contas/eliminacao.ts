import type pg from 'pg';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { auditar } from './auditoria.js';

// Eliminação completa de uma conta. Módulo sem dependências de rotas nem de sessões, usado pela
// eliminação pedida pela pessoa (dados.ts) e pela limpeza das contas nunca confirmadas (sessoes.ts).

// Contadores de tentativas que pertencem a uma conta, com os formatos exactos das chaves usadas nas
// rotas. Comparação exacta (ou prefixo terminado em ":"): apagar por "contém o e-mail" apagaria também
// os contadores de outras contas com e-mails parecidos (ana@x.co dentro de ana@x.com).
function chavesDaConta(email: string, utilizadorId: string) {
  return {
    exactas: [
      `entrar-email:${email}`,
      `recuperar-email:${email}`,
      `conta-2fa:${utilizadorId}`,
      `entrar-2fa-erros:${utilizadorId}`,
      `mudar-palavra-passe:${utilizadorId}`,
      `dados-conta:${utilizadorId}`,
      `reenviar:${utilizadorId}`,
      `criar-projecto:${utilizadorId}`,
      `prever-projecto:${utilizadorId}`,
      `convidar:${utilizadorId}`,
      `convidados:${utilizadorId}`,
      `orcamento:${utilizadorId}`,
      `fornecedores:${utilizadorId}`,
      `relatorios:${utilizadorId}`,
    ],
    prefixos: [`entrar-email-ip:${email}:`, `recuperar-email-ip:${email}:`, `entrar-2fa-erros:${utilizadorId}:`],
  };
}

// Espaços de trabalho de que a pessoa é dona e que têm outros membros: não se apagam sozinhos.
export async function espacosPartilhados(cliente: pg.Pool | pg.PoolClient, utilizadorId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    `select count(*)::int as n from workspace_members wm
      where wm.user_id = $1 and wm.role = 'owner'
        and exists (select 1 from workspace_members o where o.workspace_id = wm.workspace_id and o.user_id <> $1)`,
    [utilizadorId],
  );
  return rows[0]!.n;
}

// Apaga a conta e tudo o que lhe pertence, dentro da transacção de quem chama. Devolve false se a conta
// já não existia (ex.: dois pedidos de eliminação em simultâneo).
// Fica apenas um registo "conta.eliminada" sem nada que identifique a pessoa.
export async function eliminarContaCompleta(cliente: pg.PoolClient, utilizadorId: string): Promise<boolean> {
  const { rows } = await cliente.query<{ email: string; confirmado: boolean }>(
    'select email, email_verified_at is not null as confirmado from users where id = $1 for update',
    [utilizadorId],
  );
  const email = rows[0]?.email;
  if (!email) return false;
  await cliente.query(
    `delete from workspaces w
      where w.id in (select workspace_id from workspace_members where user_id = $1 and role = 'owner')
        and not exists (select 1 from workspace_members o where o.workspace_id = w.id and o.user_id <> $1)`,
    [utilizadorId],
  );
  // Auditoria: os registos da pessoa e os que guardam o e-mail (ex.: bloqueios de entrada).
  // Excepção: o que a pessoa fez em espaços de OUTRAS pessoas (ex.: "entrou na equipa") fica no registo
  // desses espaços, mas anónimo (sem a pessoa nem o IP): o dono continua a ver o que aconteceu na sua
  // equipa, como "Uma conta eliminada", sem dados pessoais. Os espaços da própria pessoa já foram apagados
  // acima, com os registos respectivos.
  await cliente.query(
    "delete from audit_log where (user_id = $1 and workspace_id is null) or details->>'email' = $2",
    [utilizadorId, email],
  );
  await cliente.query('update audit_log set user_id = null, ip = null where user_id = $1', [utilizadorId]);
  const chaves = chavesDaConta(email, utilizadorId);
  await cliente.query(
    `delete from rate_limits
      where key = any($1::text[]) or exists (select 1 from unnest($2::text[]) p where left(key, length(p)) = p)`,
    [chaves.exactas, chaves.prefixos],
  );
  // Convites que a pessoa criou e, só se provou que o e-mail é dela (confirmado), os feitos para esse e-mail.
  // Uma conta por confirmar pode ser de outra pessoa: não pode apagar convites verdadeiros para esse e-mail
  // (o que aconteceria também na limpeza automática das contas por confirmar).
  await cliente.query('delete from invitations where created_by = $1 or ($3 and email = $2)', [utilizadorId, email, rows[0]!.confirmado]);
  // Sessões, ligações, códigos e entradas a meio vão em cascata.
  await cliente.query('delete from users where id = $1', [utilizadorId]);
  await auditar(cliente, 'conta.eliminada', {});
  return true;
}

export const DIAS_PARA_CONFIRMAR = 7;

// Contas que nunca confirmaram o e-mail são apagadas ao fim de DIAS_PARA_CONFIRMAR dias, para que
// ninguém fique para sempre com o e-mail de outra pessoa. Uma conta por confirmar não pode criar
// conteúdo nem convidar ninguém, por isso apaga-se sempre. Devolve quantas foram de facto apagadas.
export async function apagarContasPorConfirmar(base: Pick<BaseDeDados, 'pool'>): Promise<number> {
  const { rows } = await base.pool.query<{ id: string }>(
    'select id from users where email_verified_at is null and created_at < now() - make_interval(days => $1)',
    [DIAS_PARA_CONFIRMAR],
  );
  let apagadas = 0;
  for (const { id } of rows) {
    const apagada = await emTransaccao(base.pool, async (cliente) => {
      // Pode ter confirmado entretanto: confirmar de novo dentro da transacção.
      const { rows: ainda } = await cliente.query('select 1 from users where id = $1 and email_verified_at is null for update', [id]);
      return ainda.length > 0 && (await eliminarContaCompleta(cliente, id));
    });
    if (apagada) apagadas++;
  }
  return apagadas;
}
