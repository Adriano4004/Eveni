CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"plus_ones_allowed" integer DEFAULT 0 NOT NULL,
	"response" text DEFAULT 'pending' NOT NULL,
	"plus_ones_confirmed" integer DEFAULT 0 NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_resposta_valida" CHECK ("guests"."response" in ('pending', 'yes', 'no')),
	CONSTRAINT "guests_acompanhantes_validos" CHECK ("guests"."plus_ones_allowed" between 0 and 10),
	CONSTRAINT "guests_confirmados_validos" CHECK ("guests"."plus_ones_confirmed" between 0 and "guests"."plus_ones_allowed" and ("guests"."response" = 'yes' or "guests"."plus_ones_confirmed" = 0)),
	CONSTRAINT "guests_email_minusculas" CHECK ("guests"."email" = lower("guests"."email")),
	CONSTRAINT "guests_telemovel_formato" CHECK ("guests"."phone" ~ '^\+[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guests_projecto" ON "guests" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_telemovel_unico" ON "guests" USING btree ("project_id","phone") WHERE "guests"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_email_unico" ON "guests" USING btree ("project_id","email") WHERE "guests"."email" is not null;