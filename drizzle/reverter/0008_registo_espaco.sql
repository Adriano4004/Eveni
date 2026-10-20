-- Reverte drizzle/0008_registo_espaco.sql. Só para uso manual, depois de revisto.
-- O registo de actividade do espaço deixa de poder ser mostrado (as entradas mantêm-se).
DROP INDEX IF EXISTS "audit_log_espaco";
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_workspace_id_workspaces_id_fk";
ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "workspace_id";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
