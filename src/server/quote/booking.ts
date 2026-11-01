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
import { nearestTimes } from "../../lib/startTimes.js";
import { depositFor, type DepositInfo } from "./deposit.js";
import { DEPOSIT_LINK_HOURS, depositCheckoutFor, type DepositPaymentDeps } from "../payments/depositPayment.js";
import type { RateCard } from "./rateCard.js";
import { customerRecipient, melbourneToday, SIZE_LABEL, type CustomerNotifier, type DriverNotifier, type OutgoingEmail } from "./service.js";

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
  | "depositStatus"
  | "depositCheckoutUrl"
  | "depositCheckoutExpiresAt"
  | "depositPaymentMethod"
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
  /** Stripe payment pages for the booking deposit; unset = the team sends a link. */
  deposits?: DepositPaymentDeps;
  /** Until Stripe is connected (never on the live site): makes the DEMO payment page's link for a booking. */
  demoDepositLink?: (reference: string) => string;
  /** Emails the truck's driver once the booking is on the calendar. */
  notifyDriver?: DriverNotifier;
  /** Emails the customer their booking details the day before the move. */
  notifyCustomer?: CustomerNotifier;
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
      /** The $100 deposit (move a week or more away) and how to pay it. */
      deposit?: DepositInfo;
    }
  | { ok: false; reason: Problem; error: string; availableTimes?: string[] };

export type AvailabilityToolResult =
  | {
      ok: true;
      date: string;
      /** The team has set up arrival times and this day can take online bookings. */
      onlineBookingOpen: boolean;
      why?: string;
      /** Every free arrival time -- only when there are a few; otherwise use suggestedTimes. */
      availableTimes: string[];
      /** How many arrival times are free that day. */
      freeTimeCount: number;
      /** The time the customer asked for, and whether it is free. */
      requestedTime?: string;
      requestedTimeFree?: boolean;
      /** Up to 3 free times to offer: the nearest to the one asked for, or a spread across the day. */
      suggestedTimes: string[];
      /** The available times that would be confirmed on the spot (the rest: the team confirms). */
      instantTimes: string[];
      /** Whether booking this date needs the $100 deposit. */
      deposit: DepositInfo;
    }
  | { ok: false; reason: Problem; error: string };

const DAY_CLOSED_WORDS: Record<string, string> = {
  not_set_up: "Online arrival times aren't set up yet -- take a booking request with their preferred time in notes.",
  not_a_working_day: "Blue Line doesn't take online bookings for that day of the week.",
  closed: "That date is closed for online bookings.",
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
    customerEmail: q.email,
    // The customer gets the day-before email with their booking details (Ayesha, 2026-10-28).
    customerNoticeWanted: Boolean(q.email),
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
/** More free times than this and the chat gets suggestions instead of the whole list. */
const LIST_ALL_UP_TO = 6;

export async function availabilityForQuote(input: { reference: string; preferredTime?: string } & BookingAuth, deps: BookingDeps): Promise<AvailabilityToolResult> {
  const checked = await bookableQuote(input.reference, input, deps);
  if (!checked.ok) return checked;
  const { q, nowLocal } = checked;
  const job = jobFromQuote(q);
  if (!job) return { ok: false, reason: "no_estimate", error: "This estimate can't be booked online; the team will arrange it." };

  const result = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
  const free = result.slots.filter((s) => s.available).map((s) => s.time);
  const wanted = input.preferredTime && /^\d{2}:\d{2}$/.test(input.preferredTime) ? input.preferredTime : undefined;
  return {
    ok: true,
    date: job.date,
    onlineBookingOpen: result.dayOpen,
    why: result.dayOpen ? undefined : DAY_CLOSED_WORDS[result.dayReason ?? "not_set_up"],
    availableTimes: free.length <= LIST_ALL_UP_TO ? free : [],
    freeTimeCount: free.length,
    ...(wanted ? { requestedTime: wanted, requestedTimeFree: free.includes(wanted) } : {}),
    suggestedTimes: nearestTimes(free, wanted),
    // A booking with a deposit is never confirmed on the spot: the team confirms once it's paid.
    instantTimes: result.dayOpen && result.instantConfirm && !depositFor(job.date, nowLocal.slice(0, 10), null).required ? result.slots.filter((s) => s.available && !s.substituteTruckType).map((s) => s.time) : [],
    deposit: depositFor(job.date, nowLocal.slice(0, 10), null),
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
  if (q.bookingStatus) {
    return { ok: true, status: "already_requested", reference: q.reference, emailed: false, arrivalTime: q.bookingArrivalTime, deposit: await depositWithLink(q, nowLocal, deps) };
  }

  const notes = (input.notes ?? "").trim().slice(0, 500);
  const arrivalTime = input.arrivalTime && /^\d{2}:\d{2}$/.test(input.arrivalTime) ? input.arrivalTime : null;
  const terms: BookingTerms = { termsVersion: BOOKING_TERMS_VERSION, termsText: BOOKING_TERMS, notes: notes || null, arrivalTime };
  const testMode = q.rateCardStatus !== "confirmed";
  const job = jobFromQuote(q);
  const deposit = depositFor(q.movingDate, nowLocal.slice(0, 10), null);

  // Told to the team when the job would go on a different truck than estimated.
  let capacityNote: string | null = null;

  // A chosen arrival time must actually be free (when the team has set arrival times up).
  if (arrivalTime && job) {
    const check = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
    if (check.dayOpen) {
      const slot = check.slots.find((s) => s.time === arrivalTime);
      const availableTimes = check.slots.filter((s) => s.available).map((s) => s.time);
      if (!slot?.available) {
        return { ok: false, reason: "time_unavailable", error: "That arrival time isn't available -- offer one of these free times instead.", availableTimes: nearestTimes(availableTimes, arrivalTime) };
      }

      if (slot.substituteTruckType) {
        capacityNote = `No ${job.truckType} truck is free at ${arrivalTime}; a ${slot.substituteTruckType} is free (more trips if smaller). Please check it works, then confirm.`;
      }

      // Instant confirmation: re-checked under the date lock so the last truck can't go twice.
      // Never when it would go on a different truck -- the team decides those.
      // Not when a deposit is due (a move 7+ days away): the team confirms once it's paid.
      if (check.instantConfirm && !testMode && !slot.substituteTruckType && !deposit.required) {
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
          const emailed = await sendBookedNotices(q, job.date, arrivalTime, notes, deposit, testMode, deps);
          return { ok: true, status: "confirmed", reference: q.reference, emailed, arrivalTime, deposit };
        }
        // Someone took that time a moment ago.
        const fresh = checkAvailability(job, { ...(await deps.bookings.loadCapacity(job.date)), nowLocal });
        return {
          ok: false,
          reason: "time_unavailable",
          error: "That arrival time was just taken -- offer one of these free times instead.",
          availableTimes: nearestTimes(fresh.slots.filter((s) => s.available).map((s) => s.time), arrivalTime),
        };
      }
    }
  }

  // Otherwise: a booking request for the team to confirm.
  if (!(await deps.bookings.markRequested(q.reference, terms))) {
    return { ok: true, status: "already_requested", reference: q.reference, emailed: false };
  }
  // A deposit booking gets its own Stripe payment page; paying it confirms the booking
  // automatically if the time is still free (confirmPaidBooking).
  const depositNow = deposit.required ? await depositWithLink(q, nowLocal, deps) : deposit;
  const details = { ...emailInput(q, notes, arrivalTime), deposit: depositNow };
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
  return { ok: true, status: "requested", reference: q.reference, emailed: customerSent, arrivalTime, deposit: depositNow };
}

/**
 * A booking just went on the calendar automatically: tell the team, send the customer the
 * branded PDF marked Confirmed (plain email if the PDF can't be made), and email the truck's
 * driver. Returns whether the customer was emailed.
 */
async function sendBookedNotices(q: StoredQuote, date: string, arrivalTime: string, notes: string, deposit: DepositInfo, testMode: boolean, deps: BookingDeps): Promise<boolean> {
  const details = { ...emailInput(q, notes, arrivalTime), deposit };
  const card = q.rateCardSnapshot as Pick<RateCard, "gst" | "trucks">;
  const lines = linesFromEstimate(q.internalBreakdown as InternalBreakdown, q.amountAud!, card);
  const [, customer] = await Promise.all([
    deps.sendEmail({ ...renderBookingTeamEmail({ ...details, phone: q.phone, email: q.email, testMode, autoConfirmed: true, via: q.source }), to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false),
    sendCustomerQuote(
      {
        kind: "booked",
        to: q.email,
        reference: q.reference,
        customerName: q.customerName,
        email: q.email,
        phone: q.phone,
        movingDate: date,
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
  // The truck's driver gets the job's details, and the customer the day-before email (both wait
  // for the day before the move; never throw, never undo the booking).
  await deps.notifyDriver?.({ quoteReference: q.reference }).catch(() => undefined);
  await deps.notifyCustomer?.({ quoteReference: q.reference }).catch(() => undefined);
  return customer.emailed;
}

/**
 * Chat: emails the customer a copy of an estimate from this chat (the branded PDF quote, or a
 * plain email). The chat no longer emails every estimate (Ayesha, 2026-10-28): the customer sees
 * it in the chat, and the booked email repeats it with the PDF. It offers a copy when they don't
 * book there and then.
 */
export async function emailEstimateCopy(input: { reference: string } & BookingAuth, deps: BookingDeps): Promise<{ ok: true; emailed: boolean } | { ok: false; reason: Problem; error: string }> {
  const checked = await bookableQuote(input.reference, input, deps);
  if (!checked.ok) return checked;
  const { q } = checked;
  const card = q.rateCardSnapshot as Pick<RateCard, "gst" | "trucks">;
  const lines = linesFromEstimate(q.internalBreakdown as InternalBreakdown, q.amountAud!, card);
  const sent = await sendCustomerQuote(
    {
      kind: "quote",
      to: q.email,
      reference: q.reference,
      customerName: q.customerName,
      email: q.email,
      phone: q.phone,
      movingDate: q.movingDate,
      arrivalTime: null,
      from: q.fromText ?? "",
      toAddress: q.toText ?? "",
      lines,
      truckLabel: lines.truck ? (card.trucks?.[lines.truck]?.label ?? lines.truck) : null,
      note: null,
      validUntil: q.validUntil,
      testMode: q.rateCardStatus !== "confirmed",
    },
    deps,
  );
  return { ok: true, emailed: sent.emailed };
}

export type PaidBookingOutcome =
  | {
      outcome: "confirmed";
      arrivalTime: string;
      date: string;
      /**
       * The team email, the branded PDF to the customer and the driver notice. Already running
       * (never rejects); resolves to whether the customer was emailed. These are the slow part
       * (the PDF takes ~15 s), so the Stripe webhook answers Stripe first and lets them finish
       * afterwards -- see api/stripe/webhook.ts.
       */
      notices: Promise<boolean>;
    }
  | { outcome: "already_confirmed" }
  /** Paid, but the team has to confirm: `problem` says why (told to the team). */
  | { outcome: "needs_team"; problem: string };

const SLOT_PROBLEM: Record<string, string> = {
  not_set_up: "online arrival times aren't set up on the Settings page",
  not_a_working_day: "that day isn't a working day on the Settings page",
  closed: "that date is closed on the Settings page",
  in_the_past: "the moving date has passed",
  outside_working_hours: "the arrival time is outside working hours",
  too_soon: "the arrival time is too soon",
  no_truck: "no truck of the right size is free at that time any more",
  no_movers: "not enough movers are free at that time any more",
};

/**
 * Stripe says the deposit is paid: confirm the booking automatically if its arrival time still
 * has the truck and crew free (checked under the date's lock, like an instant booking). The
 * team's "confirm instantly" switch doesn't matter here -- the payment is the go-ahead. If it
 * can't be confirmed, the booking stays a request for the team, with the reason. Safe to call
 * again for the same booking: once it's confirmed, it returns "already_confirmed".
 * `stripeTestMode`: paid with Stripe test keys -- only then may a test-price estimate be booked.
 */
export async function confirmPaidBooking(reference: string, stripeTestMode: boolean, deps: BookingDeps): Promise<PaidBookingOutcome> {
  const q = await deps.bookings.findQuote(reference);
  if (!q) return { outcome: "needs_team", problem: "the booking wasn't found" };
  if (q.bookingStatus === "confirmed") return { outcome: "already_confirmed" };
  if (q.bookingStatus !== "requested") return { outcome: "needs_team", problem: "there's no open booking request for it (it may have been cancelled)" };

  const testMode = q.rateCardStatus !== "confirmed";
  if (testMode && !stripeTestMode) return { outcome: "needs_team", problem: "the estimate is a test price but the payment was real" };
  const job = jobFromQuote(q);
  const arrivalTime = q.bookingArrivalTime;
  if (!job) return { outcome: "needs_team", problem: "the estimate doesn't have the truck, crew and hours the calendar needs" };
  if (!arrivalTime) return { outcome: "needs_team", problem: "the customer didn't pick an arrival time (online times weren't offered)" };

  const nowLocal = melbourneNowLocal((deps.now ?? (() => new Date()))());
  const slotProblem = (capacity: Omit<CapacitySnapshot, "nowLocal">): string | null => {
    const check = checkAvailability(job, { ...capacity, nowLocal });
    if (!check.dayOpen) return SLOT_PROBLEM[check.dayReason ?? "not_set_up"] ?? "the day isn't open for online bookings";
    const slot = check.slots.find((s) => s.time === arrivalTime);
    if (!slot) return "that arrival time is no longer one of the online arrival times";
    if (!slot.available) return SLOT_PROBLEM[slot.reason ?? ""] ?? "that time is no longer free";
    if (slot.substituteTruckType) return `no ${job.truckType} is free at that time -- only a ${slot.substituteTruckType} (the team decides those)`;
    return null;
  };

  // Set inside the date lock when the slot can't be booked.
  const seen: { problem: string | null } = { problem: null };
  const booked = await deps.bookings.confirm(
    q.reference,
    job.date,
    (capacity) => {
      seen.problem = slotProblem(capacity);
      if (seen.problem) return null;
      const check = checkAvailability(job, { ...capacity, nowLocal });
      const slot = check.slots.find((s) => s.time === arrivalTime);
      return { booking: calendarRow(q, job, arrivalTime, slot?.truckId ?? null, "deposit paid (confirmed automatically)", q.bookingNotes), result: true };
    },
    {},
  );
  if (!booked) {
    // null with no problem = the team confirmed it a moment ago.
    if (seen.problem) return { outcome: "needs_team", problem: seen.problem };
    const now = await deps.bookings.findQuote(reference);
    return now?.bookingStatus === "confirmed" ? { outcome: "already_confirmed" } : { outcome: "needs_team", problem: "it couldn't be added to the calendar" };
  }

  const deposit = { ...depositFor(q.movingDate, nowLocal.slice(0, 10), null), required: true, paid: true };
  // Started now, not awaited: the booking is already safely confirmed in the database.
  const notices = sendBookedNotices({ ...q, depositStatus: "paid" }, job.date, arrivalTime, q.bookingNotes ?? "", deposit, testMode, deps).catch(() => false);
  return { outcome: "confirmed", arrivalTime, date: job.date, notices };
}

/** The deposit for a requested booking, with its payment link (made now if needed). */
async function depositWithLink(q: StoredQuote, nowLocal: string, deps: BookingDeps): Promise<DepositInfo> {
  const deposit = depositFor(q.movingDate, nowLocal.slice(0, 10), null);
  if (q.depositStatus === "paid" || q.depositStatus === "processing") return { ...deposit, paid: q.depositStatus === "paid" };
  if (!deposit.required) return deposit;
  const now = (deps.now ?? (() => new Date()))();
  const link = await depositCheckoutFor(q, deps.deposits, now);
  if (link) return { ...deposit, paymentLink: link, linkValidHours: DEPOSIT_LINK_HOURS };
  if (!deps.deposits && deps.demoDepositLink) return { ...deposit, paymentLink: deps.demoDepositLink(q.reference), linkValidHours: DEPOSIT_LINK_HOURS, demo: true };
  return deposit;
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
