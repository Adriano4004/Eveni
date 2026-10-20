-- Reverte drizzle/0009_convidados.sql. Só para uso manual, depois de revisto.
-- Apaga as listas de convidados de todos os projectos.
DROP TABLE IF EXISTS "guests";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
