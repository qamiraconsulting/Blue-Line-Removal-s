import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Tracks the estimate -> quotation -> confirmed_booking distinction from the
// architecture doc (Section 11 / Section 7 of the playbook) at the schema
// level, not just in prompt language -- the chatbot can only ever produce
// an "estimate"; create_quote and the (future) booking flow are what move a
// lead into the later states.
export const leadStatusEnum = pgEnum("lead_status", ["estimate", "quotation", "confirmed_booking"]);

// pricing_config and inventory_rules are deliberately data, not code -- Blue
// Line can change a rate or a handling-time assumption without a redeploy.
// pricing_config is versioned rather than mutated in place so a quote that
// already went out stays explainable against the rules that produced it.
export const pricingConfig = pgTable("pricing_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  configVersion: text("config_version").notNull(),
  // Shape (see src/server/schemas/pricingConfig.ts for the Zod-validated
  // version of this): truck/crew tiers, additional-mover rate, per-charge
  // fees (stairs, heavy item, piano, long carry), the two rate-card fields
  // still PENDING from Blue Line (weekend/holiday %, GST treatment), and
  // the confirmed call-out formula (Tarneit depot address + AUD $60/hr,
  // one-hour minimum, rounded up to the full hour).
  rules: jsonb("rules").notNull(),
  active: boolean("active").notNull().default(false),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryRules = pgTable("inventory_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemCategory: text("item_category").notNull(),
  cubicVolume: numeric("cubic_volume").notNull(),
  handlingDifficulty: text("handling_difficulty").notNull(),
  moversRequired: integer("movers_required").notNull().default(2),
  loadingMinutes: integer("loading_minutes").notNull(),
  unloadingMinutes: integer("unloading_minutes").notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Persisted server-side per the architecture doc's Section 14 -- the
  // chatbot state machine's current node (GREETING, COLLECTING_PICKUP, ...),
  // read on resume rather than re-derived from the transcript.
  state: text("state").notNull().default("GREETING"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  channel: text("channel").notNull().default("web_chat"),
});

// role is intentionally wider than "user" | "assistant" | "tool" -- per the
// playbook's escalation design (Section 7a), a human agent's reply from the
// internal dashboard lands in this same table as role: "human_agent", so an
// escalated conversation reads as one continuous thread, not two systems.
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant" | "tool" | "human_agent"
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: leadStatusEnum("status").notNull().default("estimate"),
  source: text("source").notNull().default("chatbot"), // chatbot | quote_form | callback_modal
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  customerName: text("customer_name"),
  phone: text("phone"),
  email: text("email"),
  preferredContactMethod: text("preferred_contact_method"),

  pickupAddressRaw: text("pickup_address_raw"),
  pickupAddressFormatted: text("pickup_address_formatted"),
  pickupLatitude: numeric("pickup_latitude"),
  pickupLongitude: numeric("pickup_longitude"),
  pickupPlaceId: text("pickup_place_id"),

  destinationAddressRaw: text("destination_address_raw"),
  destinationAddressFormatted: text("destination_address_formatted"),
  destinationLatitude: numeric("destination_latitude"),
  destinationLongitude: numeric("destination_longitude"),
  destinationPlaceId: text("destination_place_id"),

  movingDate: date("moving_date"),
  movingTime: text("moving_time"),
  propertyType: text("property_type"),
  bedrooms: integer("bedrooms"),

  pickupFloor: integer("pickup_floor"),
  pickupLift: boolean("pickup_lift"),
  pickupStairs: boolean("pickup_stairs"),
  destinationFloor: integer("destination_floor"),
  destinationLift: boolean("destination_lift"),
  destinationStairs: boolean("destination_stairs"),
  parkingInformation: text("parking_information"),

  packingRequired: boolean("packing_required"),
  // Free text for the "I have a piano" case -- always triggers
  // human_followup_required, per the playbook's escalation rules.
  specialItems: text("special_items"),

  distanceKm: numeric("distance_km"),
  travelMinutes: integer("travel_minutes"),
  moveComplexityScore: numeric("move_complexity_score"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  recommendedTruck: text("recommended_truck"),
  recommendedMovers: integer("recommended_movers"),

  estimatedPriceMin: numeric("estimated_price_min"),
  estimatedPriceMax: numeric("estimated_price_max"),

  // The confirmed call-out formula's output, kept on the lead so a later
  // "why did the bot say that" question is answerable without recomputing
  // truck-location history: max(1, ceil(travel_hours)) x AUD $60.
  callOutFeeAud: numeric("call_out_fee_aud"),
  // The proximity-hook flag from the playbook -- true when travel_hours <= 1,
  // i.e. no extra charge beyond the standard minimum. Persisted so the exact
  // customer-facing claim made in chat is auditable later.
  noExtraTravelCharge: boolean("no_extra_travel_charge"),

  humanFollowupRequired: boolean("human_followup_required").notNull().default(false),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  notes: text("notes"),
});

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  itemCategory: text("item_category").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  estimatedVolume: numeric("estimated_volume"),
  heavyItem: boolean("heavy_item").notNull().default(false),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  // chat_started | quote_requested | pickup_entered | destination_entered |
  // address_validated | route_calculated | inventory_started |
  // inventory_completed | estimate_generated | estimate_viewed |
  // lead_created | human_requested | chat_abandoned -- per architecture
  // doc Section 18/14. chat_abandoned is inferred server-side from
  // last_activity_at, never fired by the client.
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per quote-form submission -- priced or sent to a person. Stores the exact
// inputs, the internal cost breakdown and a snapshot of the rate card it was priced
// from, so any quote can be reproduced later ("you quoted me $X"). The internal
// breakdown (hourly rates, call-out) lives here only and is never sent to a customer.
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    status: text("status").notNull(), // "priced" | "manual_review"
    manualReason: text("manual_reason"),

    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    // Lower-cased / digits-only copies used for the one-discount-per-person check.
    emailNormalised: text("email_normalised").notNull(),
    phoneNormalised: text("phone_normalised").notNull(),

    need: text("need").notNull(),
    propertySize: text("property_size"),
    movingDate: date("moving_date"),
    fromText: text("from_text"),
    toText: text("to_text"),

    firstMoveRequested: boolean("first_move_requested").notNull().default(false),
    firstMoveApplied: boolean("first_move_applied").notNull().default(false),

    amountAud: integer("amount_aud"), // the single flat price; null when sent to manual review
    validUntil: date("valid_until"),
    rateCardVersion: text("rate_card_version").notNull(),
    rateCardStatus: text("rate_card_status").notNull(),

    inputs: jsonb("inputs").notNull(),
    internalBreakdown: jsonb("internal_breakdown"),
    rateCardSnapshot: jsonb("rate_card_snapshot").notNull(),

    customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true }),
  },
  (t) => [index("quotes_email_idx").on(t.emailNormalised), index("quotes_phone_idx").on(t.phoneNormalised)],
);

// Google Routes lookups keyed by normalised place pair -- suburb pairs repeat constantly
// and every uncached lookup costs money.
export const distanceCache = pgTable(
  "distance_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originKey: text("origin_key").notNull(),
    destKey: text("dest_key").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("distance_cache_pair_idx").on(t.originKey, t.destKey)],
);
