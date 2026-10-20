-- Reverte drizzle/0011_mesas.sql. Só para uso manual, depois de revisto.
-- Apaga todas as mesas e a mesa de cada convidado (os convidados mantêm-se).
ALTER TABLE "guests" DROP CONSTRAINT IF EXISTS "guests_mesa_do_projecto";
DROP INDEX IF EXISTS "guests_mesa";
ALTER TABLE "guests" DROP COLUMN IF EXISTS "table_id";
DROP TABLE IF EXISTS "event_tables";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
