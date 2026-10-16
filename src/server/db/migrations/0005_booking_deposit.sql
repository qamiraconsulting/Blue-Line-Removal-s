ALTER TABLE "quotes" ADD COLUMN "deposit_status" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_checkout_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_checkout_url" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_checkout_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_payment_method" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_test_mode" boolean;