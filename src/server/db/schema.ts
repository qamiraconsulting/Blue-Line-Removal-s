import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, date, index, uniqueIndex } from "drizzle-orm/pg-core";

// Lives in the `blr_chatbot` database (separate from the older tables in the same Neon
// project, which are never touched). Prices come only from src/server/quote -- nothing in
// this schema stores a rate, a range or a call-out figure for a customer.

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  channel: text("channel").notNull().default("web_chat"),
});

// role is "user" | "assistant" | "human_agent". A reply sent from the internal dashboard
// lands here as "human_agent", so an escalated conversation reads as one thread.
// toolCalls (assistant rows only) records which tools ran for that reply and what they
// returned -- e.g. the quote reference and price -- so "why did the bot say that?" is
// answerable later. It never holds the internal cost breakdown.
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

// A chat that needs a person: one row per conversation, flagged until someone replies
// from the dashboard. Quotes themselves live in `quotes`.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().default("chatbot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  customerName: text("customer_name"),
  phone: text("phone"),
  email: text("email"),
  fromText: text("from_text"),
  toText: text("to_text"),
  quoteReference: text("quote_reference"),

  humanFollowupRequired: boolean("human_followup_required").notNull().default(false),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id)
    .unique(),
  notes: text("notes"),
});

// One row per quote -- from the website form or the chat, priced or sent to a person.
// Stores the exact inputs, the internal cost breakdown and a snapshot of the rate card it
// was priced from, so any quote can be reproduced later ("you quoted me $X"). The internal
// breakdown (hourly rates, call-out) lives here only and is never sent to a customer.
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("quote_form"), // "quote_form" | "chatbot"
    conversationId: uuid("conversation_id").references(() => conversations.id),

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
