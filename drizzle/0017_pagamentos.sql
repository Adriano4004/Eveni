CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigserial NOT NULL,
	"reference" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by" uuid,
	"plan_code" text NOT NULL,
	"period" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'awaiting_proof' NOT NULL,
	"proof" "bytea",
	"proof_type" text,
	"proof_uploaded_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_plano_pago" CHECK ("payments"."plan_code" in ('empresarial', 'grandes')),
	CONSTRAINT "payments_periodo_valido" CHECK ("payments"."period" in ('monthly', 'yearly')),
	CONSTRAINT "payments_estado_valido" CHECK ("payments"."status" in ('awaiting_proof', 'pending', 'confirmed', 'rejected', 'cancelled')),
	CONSTRAINT "payments_valor_positivo" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_comprovativo" CHECK (("payments"."proof" is null and "payments"."proof_type" is null) or ("payments"."proof_type" in ('application/pdf', 'image/png', 'image/jpeg') and octet_length("payments"."proof") <= 5242880)),
	CONSTRAINT "payments_confirmado_com_periodo" CHECK ("payments"."status" <> 'confirmed' or ("payments"."period_start" is not null and "payments"."period_end" > "payments"."period_start")),
	CONSTRAINT "payments_motivo_curto" CHECK (char_length("payments"."rejection_reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_referencia_unica" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payments_espaco" ON "payments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_um_aberto_por_espaco" ON "payments" USING btree ("workspace_id") WHERE "payments"."status" in ('awaiting_proof', 'pending');