import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, date, index, uniqueIndex } from "drizzle-orm/pg-core";

// Lives in the `blr_chatbot` database (separate from the older tables in the same Neon
// project, which are never touched). Prices come only from src/server/quote -- nothing in
// this schema stores a rate, a range or a call-out figure for a customer.

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  channel: text("channel").notNull().default("web_chat"),
  // "bot" = the assistant answers; "human" = a team member replied from the dashboard, so
  // the assistant stays quiet until someone hands the chat back.
  mode: text("mode").notNull().default("bot"),
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
    // Assistant rows: Claude token usage for that reply (summed over tool rounds), for cost tracking.
    usage: jsonb("usage"),
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
    propertySize: text("property_size"), // home size id, e.g. "2_bed"
    truck: text("truck"), // the customer's choice: "4.5T" | "6-8T" | "10T" | "inspect"; null = the guide's
    movers: integer("movers"), // the customer's choice (2-4); null = the guide's
    accessNotes: text("access_notes"), // free text: stairs, parking distance, heavy items
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

    // Booking: the customer agreed in the chat to book on this estimate, with the final
    // charges confirmed at the move-day inspection; the team then confirms it.
    bookingStatus: text("booking_status"), // null | "requested" | "confirmed"
    bookingRequestedAt: timestamp("booking_requested_at", { withTimezone: true }),
    bookingConfirmedAt: timestamp("booking_confirmed_at", { withTimezone: true }),
    bookingTermsVersion: text("booking_terms_version"),
    bookingTermsText: text("booking_terms_text"), // the exact wording the customer agreed to
    bookingNotes: text("booking_notes"), // anything the customer asked for
    bookingArrivalTime: text("booking_arrival_time"), // "HH:MM" the customer chose, when arrival times are set up
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

// ---------------------------------------------------------------- bookings & capacity
// Kept up to date by the Blue Line team on the dashboard (Bookings & capacity). The chat
// reads these to offer free arrival times and, only when auto_confirm is switched on and
// every setting is filled in, to confirm a booking on the spot. Empty = not set -- the bot
// never assumes a value; it falls back to "the team will confirm".

// One row (id 1).
export const bookingSettings = pgTable("booking_settings", {
  id: integer("id").primaryKey().default(1),
  autoConfirm: boolean("auto_confirm").notNull().default(false),
  workingDays: jsonb("working_days").$type<number[]>().notNull().default([]), // 0 = Sunday ... 6 = Saturday
  arrivalTimes: jsonb("arrival_times").$type<string[]>().notNull().default([]), // "HH:MM", 24-hour
  dayEndTime: text("day_end_time"), // "HH:MM" -- jobs must finish by then
  bufferMinutes: integer("buffer_minutes"), // gap kept free after each job
  moversPerDay: integer("movers_per_day"),
  minNoticeHours: integer("min_notice_hours"),
  maxDaysAhead: integer("max_days_ahead"),
  autoConfirmMaxAud: integer("auto_confirm_max_aud"), // null = no limit
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const trucks = pgTable("trucks", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(), // e.g. "Truck 2 (ABC123)"
  truckType: text("truck_type").notNull(), // "4.5T" | "6-8T" | "10T"
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-date changes: a closed day, trucks off, or a different number of movers.
export const dayOverrides = pgTable("day_overrides", {
  date: date("date").primaryKey(),
  closed: boolean("closed").notNull().default(false),
  moversAvailable: integer("movers_available"), // null = the usual movers_per_day
  trucksUnavailable: jsonb("trucks_unavailable").$type<string[]>().notNull().default([]), // truck ids
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The booking calendar: every confirmed job -- chat bookings are added automatically,
// phone/other bookings must be added by the team or the chat can't see them.
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // "chat" | "phone" | "other"
    status: text("status").notNull().default("confirmed"), // "confirmed" | "cancelled"
    quoteReference: text("quote_reference").unique(),
    date: date("date").notNull(),
    arrivalTime: text("arrival_time").notNull(), // "HH:MM"
    estimatedMinutes: integer("estimated_minutes").notNull(),
    truckType: text("truck_type").notNull(),
    truckId: uuid("truck_id").references(() => trucks.id),
    movers: integer("movers").notNull(),
    customerName: text("customer_name"),
    phone: text("phone"),
    fromText: text("from_text"),
    toText: text("to_text"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"), // "chat (auto-confirmed)" or the team member's user id
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [index("bookings_date_idx").on(t.date)],
);
