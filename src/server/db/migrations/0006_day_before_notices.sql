ALTER TABLE "bookings" ADD COLUMN "customer_notice_wanted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "customer_notice" jsonb;