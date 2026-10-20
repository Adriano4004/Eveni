CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"note" text,
	"planned_cents" bigint DEFAULT 0 NOT NULL,
	"actual_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_items_valores_positivos" CHECK ("budget_items"."planned_cents" >= 0 and "budget_items"."actual_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_code" text NOT NULL,
	"template_version" text NOT NULL,
	"name" text NOT NULL,
	"event_date" date NOT NULL,
	"location" text,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_estado_valido" CHECK ("projects"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_task_id" text NOT NULL,
	"position" integer NOT NULL,
	"phase" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"role" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"critical" boolean NOT NULL,
	"compressed" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_estado_valido" CHECK ("tasks"."status" in ('pending', 'in_progress', 'done')),
	CONSTRAINT "tasks_datas_validas" CHECK ("tasks"."end_date" >= "tasks"."start_date")
);
--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_items_projecto" ON "budget_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_espaco" ON "projects" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_template_unica" ON "tasks" USING btree ("project_id","template_task_id");