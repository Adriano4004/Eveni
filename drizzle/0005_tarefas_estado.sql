ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_responsavel" ON "tasks" USING btree ("assignee_id");