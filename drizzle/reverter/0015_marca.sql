-- Reverte drizzle/0015_marca.sql. Só para uso manual, depois de revisto.
-- Apaga a marca (logótipo, cor e rodapé) de todos os espaços: os PDF voltam a levar a marca do Eveni.
DROP TABLE IF EXISTS "workspace_brands";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
