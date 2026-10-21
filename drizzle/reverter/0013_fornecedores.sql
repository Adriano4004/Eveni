-- Reverte drizzle/0013_fornecedores.sql. Só para uso manual, depois de revisto.
-- Apaga todos os fornecedores e a ligação das rubricas a eles (as rubricas mantêm-se).
DROP TRIGGER IF EXISTS "budget_items_fornecedor_do_espaco" ON "budget_items";
DROP FUNCTION IF EXISTS "fornecedor_do_mesmo_espaco"();
ALTER TABLE "budget_items" DROP CONSTRAINT IF EXISTS "budget_items_supplier_id_suppliers_id_fk";
DROP INDEX IF EXISTS "budget_items_fornecedor";
ALTER TABLE "budget_items" DROP COLUMN IF EXISTS "supplier_id";
DROP TABLE IF EXISTS "suppliers";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
