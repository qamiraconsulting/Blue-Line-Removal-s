ALTER TABLE "quotes" ADD COLUMN "job_status" text DEFAULT 'waiting_for_quote' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "status_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "platform_job_number" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "customer_notes" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "booking_token" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "quote_lines" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "quoted_amount_aud" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "change_note" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "quote_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "quote_sent_by" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "calendar_issue" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "final_amount_aud" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "closed_by" text;--> statement-breakpoint
CREATE INDEX "quotes_job_status_idx" ON "quotes" USING btree ("job_status");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_external_ref_idx" ON "quotes" USING btree ("external_ref");--> statement-breakpoint
-- Backfill: give existing rows the status their quote and booking fields already imply.
UPDATE "quotes" SET "job_status" = CASE
  WHEN "booking_status" = 'confirmed' THEN 'booked'
  WHEN "booking_status" = 'requested' THEN 'booking_requested'
  WHEN "booking_status" = 'cancelled' THEN 'cancelled'
  WHEN "status" = 'priced' THEN 'estimate_sent'
  ELSE 'waiting_for_quote'
END;
