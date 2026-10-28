ALTER TABLE "bookings" ADD COLUMN "no_driver_alert_sent_at" timestamp with time zone;--> statement-breakpoint
-- Drivers are now picked per job (Blue Line, 28 Oct 2026). Upcoming jobs that were relying on
-- their truck's usual driver keep that driver, then trucks stop having one.
UPDATE "bookings" b SET "driver_id" = t."driver_id"
FROM "trucks" t
WHERE b."truck_id" = t."id" AND t."driver_id" IS NOT NULL AND b."driver_id" IS NULL AND b."driver_name" IS NULL
  AND b."status" = 'confirmed' AND b."date" >= (now() AT TIME ZONE 'Australia/Melbourne')::date;--> statement-breakpoint
UPDATE "trucks" SET "driver_id" = NULL WHERE "driver_id" IS NOT NULL;
