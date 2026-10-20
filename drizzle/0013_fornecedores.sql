CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_email_minusculas" CHECK ("suppliers"."email" = lower("suppliers"."email")),
	CONSTRAINT "suppliers_telemovel_formato" CHECK ("suppliers"."phone" ~ '^\+[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_nome_unico" ON "suppliers" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_items_fornecedor" ON "budget_items" USING btree ("supplier_id");--> statement-breakpoint
-- Escrito à mão: o fornecedor de uma rubrica tem de ser do mesmo espaço de trabalho do projecto (CLAUDE.md,
-- secção 5, regra 5; falha da versão anterior: IDOR no fornecedor do orçamento). O servidor já o verifica;
-- este gatilho garante-o também na base de dados, para nenhum caminho esquecido o poder contornar.
CREATE FUNCTION "fornecedor_do_mesmo_espaco"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."supplier_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "suppliers" s JOIN "projects" p ON p."workspace_id" = s."workspace_id"
     WHERE s."id" = NEW."supplier_id" AND p."id" = NEW."project_id"
  ) THEN
    RAISE EXCEPTION 'fornecedor de outro espaço de trabalho' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "budget_items_fornecedor_do_espaco" BEFORE INSERT OR UPDATE OF "supplier_id", "project_id" ON "budget_items"
  FOR EACH ROW EXECUTE FUNCTION "fornecedor_do_mesmo_espaco"();
