import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { quotes } from "../db/schema.js";
import {
  BOOKING_TERMS,
  BOOKING_TERMS_VERSION,
  renderBookingConfirmedEmail,
  renderBookingRequestEmail,
  renderBookingTeamEmail,
  type BookingEmailInput,
} from "./bookingEmails.js";
import type { PropertySizeId } from "./calculateQuote.js";
import { formatDateLabel, type QuoteDetails } from "./emails.js";
import type { RateCard } from "./rateCard.js";
import { melbourneToday, SIZE_LABEL, type OutgoingEmail } from "./service.js";

// Booking on an estimate. The team inspects on the move day itself, so the customer books on
// the estimate and the final charges are confirmed on the day. A booking request is only
// taken once the customer has explicitly agreed to BOOKING_TERMS in the chat; the team then
// confirms it from the dashboard. Nothing here ever changes the estimate.

export type StoredQuote = Pick<
  typeof quotes.$inferSelect,
  | "reference"
  | "conversationId"
  | "status"
  | "amountAud"
  | "validUntil"
  | "customerName"
  | "phone"
  | "email"
  | "propertySize"
  | "truck"
  | "movers"
  | "accessNotes"
  | "movingDate"
  | "fromText"
  | "toText"
  | "internalBreakdown"
  | "rateCardSnapshot"
  | "rateCardStatus"
  | "bookingStatus"
  | "bookingNotes"
>;

export interface BookingStore {
  findQuote(reference: string): Promise<StoredQuote | null>;
  /** Marks the quote as requested only if it isn't already; returns false if it was. */
  markRequested(reference: string, booking: { termsVersion: string; termsText: string; notes: string | null }): Promise<boolean>;
  /** requested -> confirmed; returns false if it wasn't a pending request. */
  markConfirmed(reference: string): Promise<boolean>;
}

export interface BookingDeps {
  bookings: BookingStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  teamEmail: string;
  customerReplyTo: string;
  now?: () => Date;
}

export type BookingResult =
  | { ok: true; status: "requested" | "already_requested" | "confirmed"; reference: string; emailed: boolean }
  | { ok: false; reason: "not_found" | "no_estimate" | "expired" | "not_pending"; error: string };

/** The same details block the estimate email shows, rebuilt from the stored quote. */
export function quoteDetailsFromRow(q: StoredQuote): QuoteDetails {
  const card = q.rateCardSnapshot as Pick<RateCard, "trucks">;
  const internal = q.internalBreakdown as { truck?: keyof RateCard["trucks"]; movers?: number } | null;
  const truck = internal?.truck ?? (q.truck && q.truck !== "inspect" ? (q.truck as keyof RateCard["trucks"]) : null);
  const movers = internal?.movers ?? q.movers;
  const label = truck ? card.trucks?.[truck]?.label : null;
  const capacity = label ? `${label}${movers ? `, ${movers} movers` : ""}${q.truck === "inspect" ? " (confirmed on the day)" : ""}` : "";
  return {
    from: q.fromText ?? "",
    to: q.toText ?? "",
    dateLabel: formatDateLabel(q.movingDate),
    propertySize: q.propertySize ? (SIZE_LABEL[q.propertySize as PropertySizeId] ?? "") : "",
    capacity,
    accessNotes: q.accessNotes ?? "",
  };
}

const emailInput = (q: StoredQuote, notes: string): BookingEmailInput => ({
  name: q.customerName,
  reference: q.reference,
  amountAud: q.amountAud ?? 0,
  details: quoteDetailsFromRow(q),
  notes,
});

/** Chat: the customer agreed to the terms -- take the booking request. */
export async function requestBooking(
  input: { reference: string; conversationId: string; notes?: string },
  deps: BookingDeps,
): Promise<BookingResult> {
  const today = melbourneToday((deps.now ?? (() => new Date()))());
  const q = await deps.bookings.findQuote(input.reference.trim().toUpperCase());

  // Only a quote made in this same chat can be booked from it.
  if (!q || q.conversationId !== input.conversationId) {
    return { ok: false, reason: "not_found", error: "That estimate reference isn't from this chat." };
  }
  if (q.status !== "priced" || q.amountAud === null) {
    return { ok: false, reason: "no_estimate", error: "This job needs a personal quote, so the team will arrange the booking with the customer." };
  }
  if ((q.validUntil && q.validUntil < today) || (q.movingDate && q.movingDate < today)) {
    return { ok: false, reason: "expired", error: "That estimate has expired -- work out a fresh one with get_quote before booking." };
  }
  if (q.bookingStatus) return { ok: true, status: "already_requested", reference: q.reference, emailed: false };

  const notes = (input.notes ?? "").trim().slice(0, 500);
  const marked = await deps.bookings.markRequested(q.reference, { termsVersion: BOOKING_TERMS_VERSION, termsText: BOOKING_TERMS, notes: notes || null });
  if (!marked) return { ok: true, status: "already_requested", reference: q.reference, emailed: false };

  // Test-mode (placeholder rate card) estimates are never emailed to a customer.
  const testMode = q.rateCardStatus !== "confirmed";
  const details = emailInput(q, notes);
  const team = renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode });
  const [, customerSent] = await Promise.all([
    deps.sendEmail({ ...team, to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
    testMode
      ? Promise.resolve(false)
      : deps.sendEmail({ ...renderBookingRequestEmail(details), to: q.email, replyTo: deps.customerReplyTo, kind: "customer" }).catch(() => false),
  ]);
  return { ok: true, status: "requested", reference: q.reference, emailed: customerSent };
}

/** Dashboard: the team confirms a booking request; the customer is emailed. */
export async function confirmBooking(reference: string, deps: BookingDeps): Promise<BookingResult> {
  const q = await deps.bookings.findQuote(reference);
  if (!q) return { ok: false, reason: "not_found", error: "Quote not found." };
  if (q.bookingStatus !== "requested" || !(await deps.bookings.markConfirmed(reference))) {
    return { ok: false, reason: "not_pending", error: "That booking isn't waiting for confirmation." };
  }
  const testMode = q.rateCardStatus !== "confirmed";
  const emailed = testMode
    ? false
    : await deps
        .sendEmail({ ...renderBookingConfirmedEmail(emailInput(q, q.bookingNotes ?? "")), to: q.email, replyTo: deps.customerReplyTo, kind: "customer" })
        .catch(() => false);
  return { ok: true, status: "confirmed", reference, emailed };
}

export const dbBookingStore: BookingStore = {
  async findQuote(reference) {
    const [row] = await getDb().select().from(quotes).where(eq(quotes.reference, reference)).limit(1);
    return row ?? null;
  },
  async markRequested(reference, booking) {
    const rows = await getDb()
      .update(quotes)
      .set({
        bookingStatus: "requested",
        bookingRequestedAt: new Date(),
        bookingTermsVersion: booking.termsVersion,
        bookingTermsText: booking.termsText,
        bookingNotes: booking.notes,
      })
      .where(and(eq(quotes.reference, reference), isNull(quotes.bookingStatus)))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
  async markConfirmed(reference) {
    const rows = await getDb()
      .update(quotes)
      .set({ bookingStatus: "confirmed", bookingConfirmedAt: new Date() })
      .where(and(eq(quotes.reference, reference), eq(quotes.bookingStatus, "requested")))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
};
