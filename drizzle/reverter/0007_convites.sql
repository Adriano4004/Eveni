-- Reverte drizzle/0007_convites.sql. Só para uso manual, depois de revisto.
-- Os convites por aceitar deixam de funcionar (os membros já aceites mantêm-se).
DROP TABLE IF EXISTS "invitations";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
