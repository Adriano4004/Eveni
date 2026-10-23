-- Reverte drizzle/0016_termos.sql. Só para uso manual, depois de revisto.
-- Apaga o registo de que cada conta aceitou os termos e a política de privacidade (e quando).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_termos_coerentes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "terms_accepted_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "terms_version";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
