-- Reverte drizzle/0006_acesso_projecto.sql. Só para uso manual, depois de revisto.
-- Os membros de projecto perdem o acesso (fica só o dono do espaço).
DROP FUNCTION IF EXISTS "papel_no_projecto"(uuid, uuid);
DROP TABLE IF EXISTS "project_members";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
