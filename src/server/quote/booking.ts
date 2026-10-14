import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { checkAvailability, type CapacitySnapshot, type JobRequest } from "../capacity/availability.js";
import { loadCapacity, melbourneNowLocal, reserve, type NewCalendarBooking } from "../capacity/store.js";
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
// the estimate and the final charges are confirmed on the day. A booking is only taken once
// the customer has explicitly agreed to BOOKING_TERMS in the chat. It is then either:
//  - confirmed on the spot, when the team has switched instant confirmation on, filled in
//    every capacity setting, and the chosen arrival time has a free truck and crew; or
//  - a request, which the team confirms on the dashboard.
// Either way a confirmed booking goes into the calendar (bookings table). Nothing here ever
// changes the estimate.

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
  | "bookingArrivalTime"
>;

export interface BookingTerms {
  termsVersion: string;
  termsText: string;
  notes: string | null;
  arrivalTime: string | null;
}

export interface BookingStore {
  findQuote(reference: string): Promise<StoredQuote | null>;
  /** Marks the quote as requested only if it isn't already booked; false if it was. */
  markRequested(reference: string, booking: BookingTerms): Promise<boolean>;
  loadCapacity(date: string): Promise<Omit<CapacitySnapshot, "nowLocal">>;
  /**
   * Under a lock on the date: `decide` re-checks capacity and returns the calendar booking,
   * which is inserted and the quote marked confirmed (with `quoteFields`). null = backed out
   * or the quote was already confirmed.
   */
  confirm<T>(
    reference: string,
    date: string,
    decide: (capacity: Omit<CapacitySnapshot, "nowLocal">) => { booking: NewCalendarBooking; result: T } | null,
    quoteFields: Partial<BookingTerms>,
  ): Promise<T | null>;
}

export interface BookingDeps {
  bookings: BookingStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  teamEmail: string;
  customerReplyTo: string;
  now?: () => Date;
}

type Problem = "not_found" | "no_estimate" | "expired" | "not_pending" | "time_unavailable" | "time_needed";

export type BookingResult =
  | {
      ok: true;
      status: "requested" | "confirmed" | "already_requested" | "already_confirmed";
      reference: string;
      emailed: boolean;
      arrivalTime?: string | null;
      /** Dashboard only: capacity didn't look free, but the team chose to confirm anyway. */
      capacityWarning?: string | null;
    }
  | { ok: false; reason: Problem; error: string; availableTimes?: string[] };

export type AvailabilityToolResult =
  | {
      ok: true;
      date: string;
      /** The team has set up arrival times and this day can take online bookings. */
      onlineBookingOpen: boolean;
      why?: string;
      availableTimes: string[];
      /** The available times that would be confirmed on the spot (the rest: the team confirms). */
      instantTimes: string[];
    }
  | { ok: false; reason: Problem; error: string };

const DAY_CLOSED_WORDS: Record<string, string> = {
  not_set_up: "Online arrival times aren't set up yet -- take a booking request with their preferred time in notes.",
  not_a_working_day: "Blue Line doesn't take online bookings for that day of the week.",
  closed: "That date is closed for online bookings.",
  too_far_ahead: "That date is too far ahead to book online.",
  in_the_past: "That date has passed.",
};

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

/** What the job needs from the calendar, from the stored estimate. */
export function jobFromQuote(q: StoredQuote): JobRequest | null {
  const i = q.internalBreakdown as { truck?: string; movers?: number; jobHours?: number } | null;
  if (!i?.truck || !i.movers || !i.jobHours || !q.movingDate || q.amountAud === null) return null;
  return { date: q.movingDate, truckType: i.truck, movers: i.movers, estimatedMinutes: Math.round(i.jobHours * 60), amountAud: q.amountAud };
}

const emailInput = (q: StoredQuote, notes: string, arrivalTime: string | null): BookingEmailInput => ({
  name: q.customerName,
  reference: q.reference,
  amountAud: q.amountAud ?? 0,
  details: quoteDetailsFromRow(q),
  notes,
  arrivalTime,
});

function calendarRow(q: StoredQuote, job: JobRequest, arrivalTime: string, truckId: string | null, createdBy: string, notes: string | null): NewCalendarBooking {
  return {
    source: "chat",
    quoteReference: q.reference,
    date: job.date,
    arrivalTime,
    estimatedMinutes: job.estimatedMinutes,
    truckType: job.truckType,
    truckId,
    movers: job.movers,
    customerName: q.customerName,
    phone: q.phone,
    fromText: q.fromText,
    toText: q.toText,
    notes,
    createdBy,
  };
}

/** Shared checks: the estimate is from this chat, priced, and still current. */
async function bookableQuote(
  reference: string,
  conversationId: string,
  deps: BookingDeps,
): Promise<{ ok: true; q: StoredQuote; nowLocal: string } | { ok: false; reason: Problem; error: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const today = melbourneToday(now);
  const q = await deps.bookings.findQuote(reference.trim().toUpperCase());
  if (!q || q.conversationId !== conversationId) return { ok: false, reason: "not_found", error: "That estimate reference isn't from this chat." };
  if (q.status !== "priced" || q.amountAud === null) {
    return { ok: false, reason: "no_estimate", error: "This job needs a personal quote, so the team will arrange the booking with the customer." };
  }
  if ((q.validUntil && q.validUntil < today) || (q.movingDate && q.movingDate < today)) {
    return { ok: false, reason: "expired", error: "That estimate has expired -- work out a fresh one with get_quote before booking." };
  }
  return { ok: true, q, nowLocal: melbourneNowLocal(now) };
}

/** Chat: which arrival times are free for this estimate's date, truck and crew. */
export async function availabilityForQuote(input: { reference: string; conversationId: string }, deps: BookingDeps): Promise<AvailabilityToolResult> {
  const checked = await bookableQuote(input.reference, input.conversationId, deps);
  if (!checked.ok) return checked;
  const { q, nowLocal } = checked;
  const job = jobFromQuote(q);
  if (!job) return { ok: false, reason: "no_estimate", error: "This estimate can't be booked online; the team will arrange it." };

  const result = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
  return {
    ok: true,
    date: job.date,
    onlineBookingOpen: result.dayOpen,
    why: result.dayOpen ? undefined : DAY_CLOSED_WORDS[result.dayReason ?? "not_set_up"],
    availableTimes: result.slots.filter((s) => s.available).map((s) => s.time),
    instantTimes: result.dayOpen && result.instantConfirm ? result.slots.filter((s) => s.available && !s.substituteTruckType).map((s) => s.time) : [],
  };
}

/** Chat: the customer agreed to the terms -- confirm on the spot if allowed, else take a request. */
export async function requestBooking(
  input: { reference: string; conversationId: string; notes?: string; arrivalTime?: string },
  deps: BookingDeps,
): Promise<BookingResult> {
  const checked = await bookableQuote(input.reference, input.conversationId, deps);
  if (!checked.ok) return checked;
  const { q, nowLocal } = checked;
  if (q.bookingStatus === "confirmed") return { ok: true, status: "already_confirmed", reference: q.reference, emailed: false, arrivalTime: q.bookingArrivalTime };
  if (q.bookingStatus) return { ok: true, status: "already_requested", reference: q.reference, emailed: false, arrivalTime: q.bookingArrivalTime };

  const notes = (input.notes ?? "").trim().slice(0, 500);
  const arrivalTime = input.arrivalTime && /^\d{2}:\d{2}$/.test(input.arrivalTime) ? input.arrivalTime : null;
  const terms: BookingTerms = { termsVersion: BOOKING_TERMS_VERSION, termsText: BOOKING_TERMS, notes: notes || null, arrivalTime };
  const testMode = q.rateCardStatus !== "confirmed";
  const job = jobFromQuote(q);

  // Told to the team when the job would go on a different truck than estimated.
  let capacityNote: string | null = null;

  // A chosen arrival time must actually be free (when the team has set arrival times up).
  if (arrivalTime && job) {
    const check = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
    if (check.dayOpen) {
      const slot = check.slots.find((s) => s.time === arrivalTime);
      const availableTimes = check.slots.filter((s) => s.available).map((s) => s.time);
      if (!slot?.available) {
        return { ok: false, reason: "time_unavailable", error: "That arrival time isn't available -- offer one of the available times.", availableTimes };
      }

      if (slot.substituteTruckType) {
        capacityNote = `No ${job.truckType} truck is free at ${arrivalTime}; a ${slot.substituteTruckType} is free (more trips if smaller). Please check it works, then confirm.`;
      }

      // Instant confirmation: re-checked under the date lock so the last truck can't go twice.
      // Never when it would go on a different truck -- the team decides those.
      if (check.instantConfirm && !testMode && !slot.substituteTruckType) {
        const booked = await deps.bookings.confirm(
          q.reference,
          job.date,
          (capacity) => {
            const again = checkAvailability(job, { ...capacity, nowLocal });
            const s = again.slots.find((x) => x.time === arrivalTime);
            if (!again.dayOpen || !again.instantConfirm || !s?.available || s.substituteTruckType) return null;
            return { booking: calendarRow(q, job, arrivalTime, s.truckId ?? null, "chat (confirmed instantly)", notes || null), result: { truckId: s.truckId ?? null } };
          },
          terms,
        );
        if (booked) {
          const details = emailInput(q, notes, arrivalTime);
          const [, customerSent] = await Promise.all([
            deps.sendEmail({ ...renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode, autoConfirmed: true }), to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
            deps.sendEmail({ ...renderBookingConfirmedEmail(details), to: q.email, replyTo: deps.customerReplyTo, kind: "customer" }).catch(() => false),
          ]);
          return { ok: true, status: "confirmed", reference: q.reference, emailed: customerSent, arrivalTime };
        }
        // Someone took that time a moment ago.
        const fresh = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
        return {
          ok: false,
          reason: "time_unavailable",
          error: "That arrival time was just taken -- offer one of the available times.",
          availableTimes: fresh.slots.filter((s) => s.available).map((s) => s.time),
        };
      }
    }
  }

  // Otherwise: a booking request for the team to confirm.
  if (!(await deps.bookings.markRequested(q.reference, terms))) {
    return { ok: true, status: "already_requested", reference: q.reference, emailed: false };
  }
  const details = emailInput(q, notes, arrivalTime);
  const [, customerSent] = await Promise.all([
    deps.sendEmail({ ...renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode, autoConfirmed: false, capacityNote }), to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
    // Test-mode (placeholder rate card) estimates are never emailed to a customer.
    testMode ? Promise.resolve(false) : deps.sendEmail({ ...renderBookingRequestEmail(details), to: q.email, replyTo: deps.customerReplyTo, kind: "customer" }).catch(() => false),
  ]);
  return { ok: true, status: "requested", reference: q.reference, emailed: customerSent, arrivalTime };
}

/** Dashboard: the team confirms a booking request -- added to the calendar, customer emailed. */
export async function confirmBooking(
  input: { reference: string; arrivalTime?: string; truckId?: string | null; confirmedBy: string },
  deps: BookingDeps,
): Promise<BookingResult> {
  const q = await deps.bookings.findQuote(input.reference);
  if (!q) return { ok: false, reason: "not_found", error: "Quote not found." };
  if (q.bookingStatus !== "requested") return { ok: false, reason: "not_pending", error: "That booking isn't waiting for confirmation." };
  const job = jobFromQuote(q);
  if (!job) return { ok: false, reason: "no_estimate", error: "This quote has no estimate to book." };
  const arrivalTime = input.arrivalTime ?? q.bookingArrivalTime;
  if (!arrivalTime || !/^\d{2}:\d{2}$/.test(arrivalTime)) return { ok: false, reason: "time_needed", error: "Choose an arrival time first." };

  const nowLocal = melbourneNowLocal((deps.now ?? (() => new Date()))());
  const confirmed = await deps.bookings.confirm(
    q.reference,
    job.date,
    (capacity) => {
      // The team decides -- but say so if the calendar doesn't show room.
      const check = checkAvailability(job, { ...capacity, nowLocal });
      const slot = check.slots.find((s) => s.time === arrivalTime);
      const truckId = input.truckId ?? slot?.truckId ?? null;
      const capacityWarning = !check.dayOpen
        ? (check.dayReason ?? "not_set_up")
        : !slot
          ? "time_not_in_settings"
          : !slot.available
            ? (slot.reason ?? null)
            : slot.substituteTruckType && !input.truckId
              ? `no ${job.truckType} free -- ${slot.substituteTruckType} assigned (more trips if smaller)`
              : null;
      return { booking: calendarRow(q, job, arrivalTime, truckId, input.confirmedBy, q.bookingNotes), result: { capacityWarning } };
    },
    { arrivalTime },
  );
  if (!confirmed) return { ok: false, reason: "not_pending", error: "That booking isn't waiting for confirmation." };

  const testMode = q.rateCardStatus !== "confirmed";
  const emailed = testMode
    ? false
    : await deps
        .sendEmail({ ...renderBookingConfirmedEmail(emailInput(q, q.bookingNotes ?? "", arrivalTime)), to: q.email, replyTo: deps.customerReplyTo, kind: "customer" })
        .catch(() => false);
  return { ok: true, status: "confirmed", reference: q.reference, emailed, arrivalTime, capacityWarning: confirmed.capacityWarning };
}

class AlreadyConfirmed extends Error {}

export const dbBookingStore: BookingStore = {
  async findQuote(reference) {
    const [row] = await getDb().select().from(quotes).where(eq(quotes.reference, reference)).limit(1);
    return row ?? null;
  },
  async markRequested(reference, b) {
    const rows = await getDb()
      .update(quotes)
      .set({
        bookingStatus: "requested",
        bookingRequestedAt: new Date(),
        bookingTermsVersion: b.termsVersion,
        bookingTermsText: b.termsText,
        bookingNotes: b.notes,
        bookingArrivalTime: b.arrivalTime,
      })
      .where(and(eq(quotes.reference, reference), isNull(quotes.bookingStatus)))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
  loadCapacity: (date) => loadCapacity(date),
  async confirm(reference, date, decide, fields) {
    try {
      return await reserve(date, decide, async (tx) => {
        const rows = await tx
          .update(quotes)
          .set({
            bookingStatus: "confirmed",
            bookingConfirmedAt: new Date(),
            ...(fields.termsVersion ? { bookingRequestedAt: new Date(), bookingTermsVersion: fields.termsVersion, bookingTermsText: fields.termsText } : {}),
            ...(fields.notes !== undefined ? { bookingNotes: fields.notes } : {}),
            ...(fields.arrivalTime !== undefined ? { bookingArrivalTime: fields.arrivalTime } : {}),
          })
          .where(and(eq(quotes.reference, reference), or(isNull(quotes.bookingStatus), inArray(quotes.bookingStatus, ["requested"]))))
          .returning({ reference: quotes.reference });
        if (!rows.length) throw new AlreadyConfirmed(); // rolls the calendar insert back
      });
    } catch (err) {
      if (err instanceof AlreadyConfirmed) return null;
      throw err;
    }
  },
};
