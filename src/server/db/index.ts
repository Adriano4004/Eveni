import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export type BaseDeDados = ReturnType<typeof criarBaseDeDados>;

export function criarBaseDeDados(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
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

// Aplica as migrações versionadas da pasta drizzle/ (cada uma só uma vez).
export async function aplicarMigracoes(base: BaseDeDados, pasta: string) {
  await migrate(base.db, { migrationsFolder: pasta });
}
