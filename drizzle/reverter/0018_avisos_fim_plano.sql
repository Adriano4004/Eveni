-- Reverte drizzle/0018_avisos_fim_plano.sql. Só para uso manual, depois de revisto.
-- Apaga o registo dos avisos de fim do plano já enviados (os avisos de períodos ainda por acabar voltariam a sair).
DROP TABLE IF EXISTS "plan_notices";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
