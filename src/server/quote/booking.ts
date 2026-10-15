import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { checkAvailability, type CapacitySnapshot, type JobRequest } from "../capacity/availability.js";
import { loadCapacity, melbourneNowLocal, reserve, type NewCalendarBooking } from "../capacity/store.js";
import { getDb } from "../db/client.js";
import { quotes } from "../db/schema.js";
import { linesFromEstimate } from "../jobs/lines.js";
import { sendCustomerQuote } from "../jobs/sendQuote.js";
import type { PdfSender } from "../jobs/pdfQuote.js";
import {
  BOOKING_TERMS,
  BOOKING_TERMS_VERSION,
  renderBookingRequestEmail,
  renderBookingTeamEmail,
  type BookingEmailInput,
} from "./bookingEmails.js";
import type { InternalBreakdown, PropertySizeId } from "./calculateQuote.js";
import { formatDateLabel, type QuoteDetails } from "./emails.js";
import type { RateCard } from "./rateCard.js";
import { customerRecipient, melbourneToday, SIZE_LABEL, type OutgoingEmail } from "./service.js";

// Booking on an estimate -- from the chat or the website form. The team inspects on the move
// day itself, so the customer books on the estimate and the final charges are confirmed on the
// day. A booking is only taken once the customer has explicitly agreed to BOOKING_TERMS (in the
// chat, or the form's tick-box). It is then either:
//  - confirmed on the spot, when the team has switched instant confirmation on, filled in
//    every capacity setting, and the chosen arrival time has a free truck and crew; or
//  - a request, which the team confirms (and may edit) on the dashboard -- src/server/jobs/actions.ts.
// Either way a confirmed booking goes into the calendar (bookings table). Nothing here ever
// changes the estimate.

export type StoredQuote = Pick<
  typeof quotes.$inferSelect,
  | "reference"
  | "conversationId"
  | "source"
  | "bookingToken"
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
  testEmailTo?: string | null;
  pdf?: PdfSender;
  now?: () => Date;
}

/** Who may book an estimate: the chat it was given in, or the website form that showed it. */
export type BookingAuth = { conversationId: string } | { bookingToken: string };

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

/** The calendar's "booked via" for a quote. */
export function calendarSource(q: Pick<StoredQuote, "source">, channel?: string | null): string {
  if (q.source === "chatbot") return "chat";
  if (q.source === "quote_form") return "web_form";
  return channel ?? "other";
}

function calendarRow(q: StoredQuote, job: JobRequest, arrivalTime: string, truckId: string | null, createdBy: string, notes: string | null): NewCalendarBooking {
  return {
    source: calendarSource(q),
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

/** Shared checks: the estimate is from this chat (or this form), priced, and still current. */
async function bookableQuote(
  reference: string,
  auth: BookingAuth,
  deps: BookingDeps,
): Promise<{ ok: true; q: StoredQuote; nowLocal: string } | { ok: false; reason: Problem; error: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const today = melbourneToday(now);
  const q = await deps.bookings.findQuote(reference.trim().toUpperCase());
  const allowed =
    q !== null &&
    ("conversationId" in auth ? q.conversationId === auth.conversationId : Boolean(q.bookingToken) && q.bookingToken === auth.bookingToken);
  if (!q || !allowed) return { ok: false, reason: "not_found", error: "That estimate reference isn't from this chat." };
  if (q.status !== "priced" || q.amountAud === null) {
    return { ok: false, reason: "no_estimate", error: "This job needs a personal quote, so the team will arrange the booking with the customer." };
  }
  if ((q.validUntil && q.validUntil < today) || (q.movingDate && q.movingDate < today)) {
    return { ok: false, reason: "expired", error: "That estimate has expired -- work out a fresh one with get_quote before booking." };
  }
  return { ok: true, q, nowLocal: melbourneNowLocal(now) };
}

/** Chat: which arrival times are free for this estimate's date, truck and crew. */
export async function availabilityForQuote(input: { reference: string } & BookingAuth, deps: BookingDeps): Promise<AvailabilityToolResult> {
  const checked = await bookableQuote(input.reference, input, deps);
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

/** Chat or website form: the customer agreed to the terms -- confirm on the spot if allowed, else take a request. */
export async function requestBooking(
  input: { reference: string; notes?: string; arrivalTime?: string } & BookingAuth,
  deps: BookingDeps,
): Promise<BookingResult> {
  const checked = await bookableQuote(input.reference, input, deps);
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
          const card = q.rateCardSnapshot as Pick<RateCard, "gst" | "trucks">;
          const lines = linesFromEstimate(q.internalBreakdown as InternalBreakdown, q.amountAud!, card);
          const [, customer] = await Promise.all([
            deps.sendEmail({ ...renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode, autoConfirmed: true, via: q.source }), to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
            // The branded PDF quote, marked Confirmed (plain email if the PDF can't be made).
            sendCustomerQuote(
              {
                kind: "booked",
                to: q.email,
                reference: q.reference,
                customerName: q.customerName,
                email: q.email,
                phone: q.phone,
                movingDate: job.date,
                arrivalTime,
                from: q.fromText ?? "",
                toAddress: q.toText ?? "",
                lines,
                truckLabel: lines.truck ? (card.trucks?.[lines.truck]?.label ?? lines.truck) : null,
                note: null,
                validUntil: null,
                testMode,
              },
              deps,
            ),
          ]);
          return { ok: true, status: "confirmed", reference: q.reference, emailed: customer.emailed, arrivalTime };
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
  // Test-mode (placeholder rate card) estimates are never emailed to a customer -- only to the
  // preview's test inbox, if one is set.
  const customerTo = customerRecipient(q.email, testMode, deps.testEmailTo);
  const request = renderBookingRequestEmail(details);
  const [, customerSent] = await Promise.all([
    deps.sendEmail({ ...renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode, autoConfirmed: false, capacityNote, via: q.source }), to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
    customerTo
      ? deps.sendEmail({ ...request, subject: testMode ? `[TEST] ${request.subject}` : request.subject, to: customerTo, replyTo: deps.customerReplyTo, kind: "customer" }).catch(() => false)
      : Promise.resolve(false),
  ]);
  return { ok: true, status: "requested", reference: q.reference, emailed: customerSent, arrivalTime };
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
        jobStatus: "booking_requested",
        statusUpdatedAt: new Date(),
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
            jobStatus: "booked",
            statusUpdatedAt: new Date(),
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
