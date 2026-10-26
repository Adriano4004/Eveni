CREATE TABLE "plan_notices" (
	"workspace_id" uuid NOT NULL,
	"plan_ends_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_notices_workspace_id_plan_ends_at_kind_pk" PRIMARY KEY("workspace_id","plan_ends_at","kind"),
	CONSTRAINT "plan_notices_tipo_valido" CHECK ("plan_notices"."kind" in ('antes', 'fim'))
);
--> statement-breakpoint
ALTER TABLE "plan_notices" ADD CONSTRAINT "plan_notices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;