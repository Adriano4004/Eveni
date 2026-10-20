-- Reverte drizzle/0010_rsvp.sql. Só para uso manual, depois de revisto.
-- As ligações de RSVP já enviadas deixam de funcionar (as respostas recebidas mantêm-se).
DROP INDEX IF EXISTS "guests_chave_rsvp";
ALTER TABLE "guests" DROP COLUMN IF EXISTS "rsvp_key";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
