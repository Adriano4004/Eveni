-- Reverte drizzle/0003_dois_factores.sql. Só para uso manual, depois de revisto.
-- Desliga o 2FA de todas as contas.
DROP TABLE IF EXISTS "login_challenges";
DROP TABLE IF EXISTS "recovery_codes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_secret";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_pending_secret";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_enabled_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_last_step";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
