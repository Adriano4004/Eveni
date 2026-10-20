ALTER TABLE "guests" ADD COLUMN "rsvp_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_chave_rsvp" ON "guests" USING btree ("rsvp_key");