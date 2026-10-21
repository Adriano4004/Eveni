CREATE TABLE "supplier_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"rated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_ratings_estrelas_validas" CHECK ("supplier_ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_rated_by_users_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_ratings_unica" ON "supplier_ratings" USING btree ("supplier_id","project_id");--> statement-breakpoint
CREATE INDEX "supplier_ratings_projecto" ON "supplier_ratings" USING btree ("project_id");--> statement-breakpoint
-- Escrito à mão: o fornecedor avaliado tem de ser do espaço de trabalho do projecto (o mesmo gatilho das
-- rubricas, ver 0013: as colunas têm os mesmos nomes).
CREATE TRIGGER "supplier_ratings_fornecedor_do_espaco" BEFORE INSERT OR UPDATE OF "supplier_id", "project_id" ON "supplier_ratings"
  FOR EACH ROW EXECUTE FUNCTION "fornecedor_do_mesmo_espaco"();
