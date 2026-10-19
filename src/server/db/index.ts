import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export type BaseDeDados = ReturnType<typeof criarBaseDeDados>;

export function criarBaseDeDados(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    // Sem estes limites, um /health com a base de dados inacessível ficava pendurado.
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  // Uma ligação inactiva que cai (ex.: reinício do PostgreSQL) não pode derrubar o processo.
  pool.on('error', (erro) => {
    console.error('[bd] erro numa ligação inactiva:', erro.message);
  });
  const db = drizzle(pool);
  return {
    db,
    pool,
    async verificar(): Promise<boolean> {
      try {
        await pool.query('select 1');
        return true;
      } catch {
        return false;
      }
    },
    async fechar() {
      await pool.end();
    },
  };
}

// Número arbitrário e fixo que identifica o bloqueio das migrações no PostgreSQL.
const BLOQUEIO_MIGRACOES = 724_190_001;

// Aplica as migrações versionadas da pasta drizzle/ (cada uma só uma vez).
// O bloqueio garante que, com várias instâncias a arrancar ao mesmo tempo, só uma migra.
export async function aplicarMigracoes(base: BaseDeDados, pasta: string) {
  const cliente = await base.pool.connect();
  try {
    await cliente.query('select pg_advisory_lock($1)', [BLOQUEIO_MIGRACOES]);
    await migrate(drizzle(cliente), { migrationsFolder: pasta });
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [BLOQUEIO_MIGRACOES]).catch(() => {});
    cliente.release();
  }
}

// Corre o trabalho numa transacção: tudo ou nada.
export async function emTransaccao<T>(pool: pg.Pool, trabalho: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await trabalho(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
  }
}
