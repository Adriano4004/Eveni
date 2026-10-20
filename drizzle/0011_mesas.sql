-- Nota: o SET NULL ("table_id") foi escrito à mão (PostgreSQL 15 ou mais recente): apagar uma mesa só limpa a
-- mesa do convidado, nunca o projecto. O drizzle-kit gera "SET NULL" sem a coluna, o que falharia (project_id é obrigatório).
CREATE TABLE "event_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"seats" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_tables_projecto_id" UNIQUE("project_id","id"),
	CONSTRAINT "event_tables_lugares_validos" CHECK ("event_tables"."seats" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "event_tables" ADD CONSTRAINT "event_tables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_tables_nome_unico" ON "event_tables" USING btree ("project_id",lower("name"));--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_mesa_do_projecto" FOREIGN KEY ("project_id","table_id") REFERENCES "public"."event_tables"("project_id","id") ON DELETE SET NULL ("table_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guests_mesa" ON "guests" USING btree ("table_id");