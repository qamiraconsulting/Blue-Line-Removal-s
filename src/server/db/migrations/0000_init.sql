CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'chatbot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_name" text,
	"phone" text,
	"email" text,
	"from_text" text,
	"to_text" text,
	"quote_reference" text,
	"human_followup_required" boolean DEFAULT false NOT NULL,
	"conversation_id" uuid,
	"notes" text,
	CONSTRAINT "leads_conversation_id_unique" UNIQUE("conversation_id")
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
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'quote_form' NOT NULL,
	"conversation_id" uuid,
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
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distance_cache_pair_idx" ON "distance_cache" USING btree ("origin_key","dest_key");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "quotes_email_idx" ON "quotes" USING btree ("email_normalised");--> statement-breakpoint
CREATE INDEX "quotes_phone_idx" ON "quotes" USING btree ("phone_normalised");