-- Reverte drizzle/0005_tarefas_estado.sql. Só para uso manual, depois de revisto.
-- Perde as datas de conclusão das tarefas (o estado e o responsável mantêm-se).
DROP INDEX IF EXISTS "tasks_responsavel";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "completed_at";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "updated_at";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
