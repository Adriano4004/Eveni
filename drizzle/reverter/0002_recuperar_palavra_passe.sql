-- Reverte drizzle/0002_recuperar_palavra_passe.sql. Só para uso manual, depois de revisto.
DELETE FROM "email_tokens" WHERE "purpose" = 'recuperar_palavra_passe';
ALTER TABLE "email_tokens" DROP CONSTRAINT "email_tokens_finalidade_valida";
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_finalidade_valida" CHECK ("email_tokens"."purpose" in ('confirmar_email'));
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
