-- Reverte drizzle/0004_projectos.sql. Só para uso manual, depois de revisto.
-- APAGA TODOS OS PROJECTOS, TAREFAS E ORÇAMENTOS. Fazer antes uma cópia de segurança.
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "budget_items";
DROP TABLE IF EXISTS "projects";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
