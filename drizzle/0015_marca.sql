CREATE TABLE "workspace_brands" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"color" text,
	"footer" text,
	"logo" "bytea",
	"logo_type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_brands_cor_valida" CHECK ("workspace_brands"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "workspace_brands_rodape_curto" CHECK (char_length("workspace_brands"."footer") <= 200),
	CONSTRAINT "workspace_brands_logo_tipo" CHECK (("workspace_brands"."logo" is null and "workspace_brands"."logo_type" is null) or ("workspace_brands"."logo_type" in ('image/png', 'image/jpeg') and octet_length("workspace_brands"."logo") <= 512000))
);
--> statement-breakpoint
ALTER TABLE "workspace_brands" ADD CONSTRAINT "workspace_brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;