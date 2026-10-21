-- Reverte drizzle/0014_avaliacoes.sql. Só para uso manual, depois de revisto.
-- Apaga todas as avaliações de fornecedores.
DROP TABLE IF EXISTS "supplier_ratings";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
