CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_papel_valido" CHECK ("project_members"."role" in ('editor', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_members_utilizador" ON "project_members" USING btree ("user_id");--> statement-breakpoint
-- Papel de uma pessoa num projecto: 'owner' (dono do espaço do projecto), 'editor' ou 'viewer' (membro do
-- projecto), ou null (sem acesso). Uma só regra, usada por todas as consultas de projectos.
CREATE FUNCTION "papel_no_projecto"(projecto uuid, utilizador uuid) RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM projects p JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
         WHERE p.id = projecto AND wm.user_id = utilizador AND wm.role = 'owner'
      ) THEN 'owner'
      ELSE (SELECT pm.role FROM project_members pm WHERE pm.project_id = projecto AND pm.user_id = utilizador)
    END
  $$;
