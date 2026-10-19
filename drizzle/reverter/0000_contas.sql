-- Reverte drizzle/0000_contas.sql. Só para uso manual, depois de revisto.
-- Apaga todos os dados de contas: fazer cópia de segurança antes.
DROP TABLE IF EXISTS "audit_log";
DROP TABLE IF EXISTS "rate_limits";
DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "workspace_members";
DROP TABLE IF EXISTS "workspaces";
DROP TABLE IF EXISTS "users";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
