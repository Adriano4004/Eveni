-- Reverte drizzle/0001_confirmar_email.sql. Só para uso manual, depois de revisto.
DROP TABLE IF EXISTS "email_tokens";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
