-- Reverte drizzle/0017_pagamentos.sql. Só para uso manual, depois de revisto.
-- Apaga todos os pedidos de pagamento e comprovativos, e a data de fim dos planos pagos (os planos ficam
-- como estão, sem fim).
DROP TABLE IF EXISTS "payments";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "plan_ends_at";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
