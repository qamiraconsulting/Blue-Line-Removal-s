CREATE TYPE "public"."lead_status" AS ENUM('estimate', 'quotation', 'confirmed_booking');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"conversation_id" uuid,
	"event_type" text NOT NULL,
	"event_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text DEFAULT 'GREETING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text DEFAULT 'web_chat' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distance_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_key" text NOT NULL,
	"dest_key" text NOT NULL,
	"distance_meters" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"item_category" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"estimated_volume" numeric,
	"heavy_item" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_category" text NOT NULL,
	"cubic_volume" numeric NOT NULL,
	"handling_difficulty" text NOT NULL,
	"movers_required" integer DEFAULT 2 NOT NULL,
	"loading_minutes" integer NOT NULL,
	"unloading_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "lead_status" DEFAULT 'estimate' NOT NULL,
	"source" text DEFAULT 'chatbot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_name" text,
	"phone" text,
	"email" text,
	"preferred_contact_method" text,
	"pickup_address_raw" text,
	"pickup_address_formatted" text,
	"pickup_latitude" numeric,
	"pickup_longitude" numeric,
	"pickup_place_id" text,
	"destination_address_raw" text,
	"destination_address_formatted" text,
	"destination_latitude" numeric,
	"destination_longitude" numeric,
	"destination_place_id" text,
	"moving_date" date,
	"moving_time" text,
	"property_type" text,
	"bedrooms" integer,
	"pickup_floor" integer,
	"pickup_lift" boolean,
	"pickup_stairs" boolean,
	"destination_floor" integer,
	"destination_lift" boolean,
	"destination_stairs" boolean,
	"parking_information" text,
	"packing_required" boolean,
	"special_items" text,
	"distance_km" numeric,
	"travel_minutes" integer,
	"move_complexity_score" numeric,
	"estimated_duration_minutes" integer,
	"recommended_truck" text,
	"recommended_movers" integer,
	"estimated_price_min" numeric,
	"estimated_price_max" numeric,
	"call_out_fee_aud" numeric,
	"no_extra_travel_charge" boolean,
	"human_followup_required" boolean DEFAULT false NOT NULL,
	"conversation_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_version" text NOT NULL,
	"rules" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"manual_reason" text,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"email_normalised" text NOT NULL,
	"phone_normalised" text NOT NULL,
	"need" text NOT NULL,
	"property_size" text,
	"moving_date" date,
	"from_text" text,
	"to_text" text,
	"first_move_requested" boolean DEFAULT false NOT NULL,
	"first_move_applied" boolean DEFAULT false NOT NULL,
	"amount_aud" integer,
	"valid_until" date,
	"rate_card_version" text NOT NULL,
	"rate_card_status" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"internal_breakdown" jsonb,
	"rate_card_snapshot" jsonb NOT NULL,
	"customer_email_sent_at" timestamp with time zone,
	CONSTRAINT "quotes_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distance_cache_pair_idx" ON "distance_cache" USING btree ("origin_key","dest_key");--> statement-breakpoint
CREATE INDEX "quotes_email_idx" ON "quotes" USING btree ("email_normalised");--> statement-breakpoint
CREATE INDEX "quotes_phone_idx" ON "quotes" USING btree ("phone_normalised");