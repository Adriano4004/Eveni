ALTER TABLE "projects" ADD COLUMN "contingency_pct" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_valores_maximos" CHECK ("budget_items"."planned_cents" <= 10000000000000 and "budget_items"."actual_cents" <= 10000000000000);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contingencia_valida" CHECK ("projects"."contingency_pct" between 0 and 50);--> statement-breakpoint
-- Escrito à mão (dados): a rubrica "Contingência (N%)" dos projectos já criados passa a ser a percentagem
-- do projecto, e a rubrica sai da lista (a contingência passa a ser calculada; decisão 019). Até agora os
-- valores do orçamento não se podiam alterar, por isso estas rubricas estão todas a zero.
UPDATE "projects" p SET "contingency_pct" = (substring(b."description" from '\((\d{1,2})\s*%\)'))::int
  FROM "budget_items" b
 WHERE b."project_id" = p."id" AND b."description" ~* '^Conting[êe]ncia\s*\(\d{1,2}\s*%\)$';--> statement-breakpoint
DELETE FROM "budget_items"
 WHERE "description" ~* '^Conting[êe]ncia\s*\(\d{1,2}\s*%\)$' AND "planned_cents" = 0 AND "actual_cents" = 0;
