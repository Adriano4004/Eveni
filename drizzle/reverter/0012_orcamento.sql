-- Reverte drizzle/0012_orcamento.sql. Só para uso manual, depois de revisto.
-- A percentagem de contingência de cada projecto perde-se (a rubrica "Contingência (N%)" não é recriada).
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_contingencia_valida";
ALTER TABLE "budget_items" DROP CONSTRAINT IF EXISTS "budget_items_valores_maximos";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "contingency_pct";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
