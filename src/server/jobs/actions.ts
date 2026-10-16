import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { checkAvailability, type CapacitySnapshot } from "../capacity/availability.js";
import { loadCapacity, melbourneNowLocal, reserve, type NewCalendarBooking } from "../capacity/store.js";
import { getDb } from "../db/client.js";
import { bookings, quotes } from "../db/schema.js";
import { calendarSource } from "../quote/booking.js";
import type { InternalBreakdown } from "../quote/calculateQuote.js";
import { esc, firstName, shell } from "../quote/emails.js";
import { truckIds, type RateCard } from "../quote/rateCard.js";
import { customerRecipient, melbourneToday, type DriverNotifier } from "../quote/service.js";
import { site } from "../../data/site.js";
import type { DriverNoticeResult } from "../notify/driverNotice.js";
import { linesFromEstimate, teamQuote, type QuoteLines } from "./lines.js";
import { sendCustomerQuote, type SendQuoteDeps } from "./sendQuote.js";
import { TEAM_ACTIONS, type JobStatus } from "./status.js";

// What the Blue Line team does to a request on the dashboard. Every action changes the one job
// status (status.ts), and the ones that reach the customer send the branded PDF quote:
//  - sendQuote: (optionally edit, then) send the quote -- "Quoted by team"
//  - confirm:   (optionally edit, then) book it into the calendar and send the PDF marked
//               Confirmed -- "Booked". Works for booking requests from the chat and the
//               website form, and for estimates/quotes the customer accepted by phone.
//  - reject / cancel / complete (+ final amount) / markLost / reopen
// Edits (Ayesha, 2026-10-15): change the details and the price recalculates from the same rate
// card, and/or type the total by hand; a note tells the customer why it changed.

export type JobRow = typeof quotes.$inferSelect;
export type JobPatch = Partial<typeof quotes.$inferInsert>;

export interface JobStore {
  find(reference: string): Promise<JobRow | null>;
  /** Applies `patch` only while the job's status is one of `from`. false = it wasn't. */
  update(reference: string, from: readonly string[], patch: JobPatch): Promise<boolean>;
  loadCapacity(date: string): Promise<Omit<CapacitySnapshot, "nowLocal">>;
  /**
   * Under the date's lock: `decide` sees the day's capacity and returns the calendar booking;
   * it's inserted and `patch` applied -- only while the status is still one of `from`.
   */
  book<T>(
    reference: string,
    from: readonly string[],
    date: string,
    decide: (capacity: Omit<CapacitySnapshot, "nowLocal">) => { booking: NewCalendarBooking; result: T },
    patch: JobPatch,
  ): Promise<T | null>;
  cancelCalendar(reference: string): Promise<void>;
}

export interface JobDeps extends SendQuoteDeps {
  jobs: JobStore;
  rateCard: RateCard;
  /** Emails the truck's driver after the calendar changes (confirm, cancel). */
  notifyDriver?: DriverNotifier;
  now?: () => Date;
}

const time = z.string().regex(/^\d{2}:\d{2}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the team may change before sending or confirming. Leave a field out = keep it. */
export const teamEditsSchema = z.object({
  movingDate: day.nullable().optional(),
  arrivalTime: time.nullable().optional(),
  fromText: z.string().trim().max(200).optional(),
  toText: z.string().trim().max(200).optional(),
  truck: z.enum(truckIds).nullable().optional(),
  movers: z.number().int().min(1).max(10).nullable().optional(),
  hours: z.number().min(0.5).max(24).nullable().optional(),
  stairFlights: z.number().int().min(0).max(30).optional(),
  packingAud: z.number().min(0).max(20000).optional(),
  services: z.string().trim().max(200).optional(),
  /** The team's own total, GST included. */
  overrideTotal: z.number().int().min(1).max(200000).nullable().optional(),
  /** Shown to the customer with the quote. */
  note: z.string().trim().max(1000).optional(),
});
export type TeamEdits = z.infer<typeof teamEditsSchema>;

export type ActionResult =
  | { ok: true; status: JobStatus; emailed: boolean; via: "pdf" | "email" | null; total?: number; capacityWarning?: string | null; driverNotice?: DriverNoticeResult }
  | { ok: false; error: string; code: "not_found" | "not_allowed" | "invalid" | "details_needed" };

const notFound: ActionResult = { ok: false, code: "not_found", error: "That job wasn't found." };
const notAllowed = (status: string): ActionResult => ({ ok: false, code: "not_allowed", error: `That can't be done to a job that is "${status.replace(/_/g, " ")}" -- refresh the page.` });

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Matt's own quotes are emailed by his Google Form; only website/chat test figures are "test". */
export const isTestJob = (q: Pick<JobRow, "source" | "rateCardStatus">) => q.source !== "team_form" && q.rateCardStatus !== "confirmed";

const allowedFrom = (action: (typeof TEAM_ACTIONS)[JobStatus][number]) =>
  (Object.keys(TEAM_ACTIONS) as JobStatus[]).filter((s) => TEAM_ACTIONS[s].includes(action));

/** The breakdown the job has now: the team's last quote, else the instant estimate's. */
export function currentLines(q: JobRow, rateCard: RateCard): QuoteLines | null {
  if (q.quoteLines) return q.quoteLines as QuoteLines;
  if (q.internalBreakdown && q.amountAud !== null) {
    const card = (q.rateCardSnapshot as Pick<RateCard, "gst"> | null)?.gst ? (q.rateCardSnapshot as Pick<RateCard, "gst">) : rateCard;
    return linesFromEstimate(q.internalBreakdown as InternalBreakdown, q.amountAud, card);
  }
  return null;
}

const PRICE_FIELDS = ["truck", "movers", "hours", "stairFlights", "packingAud", "overrideTotal"] as const;

/** Applies the team's edits: new lines (recalculated and/or the team's total) and the row changes. */
export function applyEdits(q: JobRow, edits: TeamEdits, rateCard: RateCard): { ok: true; lines: QuoteLines; patch: JobPatch } | { ok: false; error: string } {
  const base = currentLines(q, rateCard);
  const priceChanged = PRICE_FIELDS.some((k) => edits[k] !== undefined);
  let lines: QuoteLines | null = base;

  if (priceChanged || !base) {
    const pick = <K extends "truck" | "movers" | "hours">(k: K, fallback: QuoteLines[K] | null) => (edits[k] !== undefined ? edits[k] : fallback) ?? null;
    const result = teamQuote(
      {
        truck: pick("truck", base?.truck ?? null),
        movers: pick("movers", base?.movers ?? null),
        hours: pick("hours", base?.hours ?? null),
        stairFlights: edits.stairFlights ?? base?.stairFlights ?? 0,
        packingAud: edits.packingAud ?? base?.packing ?? 0,
        firstMoveApplied: q.firstMoveApplied,
        services: edits.services ?? base?.services,
        overrideTotal: edits.overrideTotal ?? null,
      },
      rateCard,
    );
    if (!result.ok) return result;
    lines = result.lines;
  } else if (edits.services !== undefined && lines) {
    lines = { ...lines, services: edits.services || "Standard Move" };
  }
  if (!lines) return { ok: false, error: "Enter the truck, movers and hours, or type the total." };

  const patch: JobPatch = {
    quoteLines: lines,
    quotedAmountAud: lines.total,
    truck: lines.truck,
    movers: lines.movers,
  };
  // A new note replaces the last one; no note keeps it (it goes on the next PDF too).
  if (edits.note) patch.changeNote = edits.note;
  if (edits.movingDate !== undefined) patch.movingDate = edits.movingDate;
  if (edits.arrivalTime !== undefined) patch.bookingArrivalTime = edits.arrivalTime;
  if (edits.fromText !== undefined) patch.fromText = edits.fromText || null;
  if (edits.toText !== undefined) patch.toText = edits.toText || null;
  return { ok: true, lines, patch };
}

function quoteJob(q: JobRow, lines: QuoteLines, patch: JobPatch, kind: "quote" | "booked", rateCard: RateCard, extra: { arrivalTime: string | null; validUntil: string | null }) {
  return {
    kind,
    to: q.email,
    reference: q.reference,
    customerName: q.customerName,
    email: q.email,
    phone: q.phone,
    movingDate: (patch.movingDate !== undefined ? patch.movingDate : q.movingDate) ?? null,
    arrivalTime: extra.arrivalTime,
    from: (patch.fromText !== undefined ? patch.fromText : q.fromText) ?? "",
    toAddress: (patch.toText !== undefined ? patch.toText : q.toText) ?? "",
    lines,
    truckLabel: lines.truck ? rateCard.trucks[lines.truck].label : null,
    note: (patch.changeNote !== undefined ? patch.changeNote : q.changeNote) ?? null,
    validUntil: extra.validUntil,
    testMode: isTestJob(q),
  };
}

/** Edit (optional) and send the customer a quote. */
export async function sendQuoteAction(input: { reference: string; edits: TeamEdits; notifyCustomer: boolean; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const from = allowedFrom("sendQuote");
  if (!from.includes(q.jobStatus as JobStatus)) return notAllowed(q.jobStatus);

  const applied = applyEdits(q, input.edits, deps.rateCard);
  if (!applied.ok) return { ok: false, code: "details_needed", error: applied.error };

  const now = (deps.now ?? (() => new Date()))();
  const validUntil = addDays(melbourneToday(now), deps.rateCard.validityDays);
  const ok = await deps.jobs.update(q.reference, from, {
    ...applied.patch,
    jobStatus: "quoted",
    statusUpdatedAt: now,
    bookingStatus: null, // a changed quote needs the customer's OK again
    validUntil,
    quoteSentAt: input.notifyCustomer ? now : q.quoteSentAt,
    quoteSentBy: input.by,
    closedReason: null,
  });
  if (!ok) return notAllowed("changed");

  const sent = input.notifyCustomer
    ? await sendCustomerQuote(quoteJob(q, applied.lines, applied.patch, "quote", deps.rateCard, { arrivalTime: null, validUntil }), deps)
    : { emailed: false, via: null };
  return { ok: true, status: "quoted", emailed: sent.emailed, via: sent.via, total: applied.lines.total };
}

/** Edit (optional), book into the calendar and send the PDF marked Confirmed. */
export async function confirmAction(
  input: { reference: string; edits: TeamEdits; truckId?: string | null; notifyCustomer: boolean; by: string },
  deps: JobDeps,
): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const from = allowedFrom("confirm");
  if (!from.includes(q.jobStatus as JobStatus)) return notAllowed(q.jobStatus);

  const applied = applyEdits(q, input.edits, deps.rateCard);
  if (!applied.ok) return { ok: false, code: "details_needed", error: applied.error };
  const { lines, patch } = applied;

  const date = (patch.movingDate !== undefined ? patch.movingDate : q.movingDate) ?? null;
  const arrivalTime = (patch.bookingArrivalTime !== undefined ? patch.bookingArrivalTime : q.bookingArrivalTime) ?? null;
  if (!date) return { ok: false, code: "details_needed", error: "Choose the moving date first." };
  if (!arrivalTime) return { ok: false, code: "details_needed", error: "Choose an arrival time first." };
  if (!lines.truck || !lines.movers || !lines.hours) {
    return { ok: false, code: "details_needed", error: "Add the truck, movers and hours so the calendar knows what to block." };
  }

  const now = (deps.now ?? (() => new Date()))();
  const nowLocal = melbourneNowLocal(now);
  const job = { date, truckType: lines.truck, movers: lines.movers, estimatedMinutes: Math.round(lines.hours * 60), amountAud: lines.total };

  const booked = await deps.jobs.book(
    q.reference,
    from,
    date,
    (capacity) => {
      // The team decides -- but say so if the calendar doesn't show room.
      const check = checkAvailability(job, { ...capacity, nowLocal, settings: { ...capacity.settings, arrivalTimes: [arrivalTime], minNoticeHours: 0, maxDaysAhead: null } });
      const slot = check.slots.find((s) => s.time === arrivalTime);
      const capacityWarning = !check.dayOpen
        ? (check.dayReason ?? "not_set_up")
        : !slot?.available
          ? (slot?.reason ?? "no_room")
          : slot.substituteTruckType && !input.truckId
            ? `no ${job.truckType} free -- ${slot.substituteTruckType} assigned (more trips if smaller)`
            : null;
      return {
        booking: {
          source: calendarSource(q, q.channel),
          quoteReference: q.reference,
          date,
          arrivalTime,
          estimatedMinutes: job.estimatedMinutes,
          truckType: job.truckType,
          truckId: input.truckId ?? slot?.truckId ?? null,
          movers: job.movers,
          customerName: q.customerName,
          phone: q.phone,
          customerEmail: q.email,
          fromText: (patch.fromText !== undefined ? patch.fromText : q.fromText) ?? null,
          toText: (patch.toText !== undefined ? patch.toText : q.toText) ?? null,
          notes: q.bookingNotes,
          createdBy: input.by,
        },
        result: { capacityWarning },
      };
    },
    {
      ...patch,
      movingDate: date,
      bookingArrivalTime: arrivalTime,
      jobStatus: "booked",
      statusUpdatedAt: now,
      bookingStatus: "confirmed",
      bookingConfirmedAt: now,
      quoteSentAt: input.notifyCustomer ? now : q.quoteSentAt,
      quoteSentBy: input.by,
      calendarIssue: null,
      closedReason: null,
    },
  );
  if (!booked) return notAllowed("changed");

  const sent = input.notifyCustomer
    ? await sendCustomerQuote(quoteJob(q, lines, { ...patch, movingDate: date }, "booked", deps.rateCard, { arrivalTime, validUntil: null }), deps)
    : { emailed: false, via: null };
  // The truck's driver gets the job's details (never throws, never undoes the booking).
  const driver = await deps.notifyDriver?.({ quoteReference: q.reference }).catch(() => undefined);
  return { ok: true, status: "booked", emailed: sent.emailed, via: sent.via, total: lines.total, capacityWarning: booked.capacityWarning, driverNotice: driver };
}

/** Blue Line can't do it. Optionally tells the customer (a short, polite email). */
export async function rejectAction(input: { reference: string; reason: string; messageToCustomer?: string; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const now = (deps.now ?? (() => new Date()))();
  const ok = await deps.jobs.update(q.reference, allowedFrom("reject"), {
    jobStatus: "rejected",
    statusUpdatedAt: now,
    bookingStatus: null,
    closedReason: input.reason,
    closedBy: input.by,
  });
  if (!ok) return notAllowed(q.jobStatus);

  let emailed = false;
  const message = input.messageToCustomer?.trim();
  const to = message ? customerRecipient(q.email, isTestJob(q), deps.testEmailTo) : null;
  if (message && to) {
    const text = [`Hi ${firstName(q.customerName)},`, "", message, "", `Reference: ${q.reference}`, `Questions? Call us on ${site.phone.display}.`, "", site.name].join("\n");
    emailed = await deps
      .sendEmail({
        subject: `${isTestJob(q) ? "[TEST] " : ""}About your request (ref ${q.reference})`,
        text,
        html: shell(`<p style="margin:0 0 14px">Hi ${esc(firstName(q.customerName))},</p><p style="margin:0 0 14px">${esc(message)}</p><p style="margin:0;font-size:13px;color:#5b6b7c">Reference ${esc(q.reference)} &middot; ${esc(site.phone.display)}</p>`),
        to,
        replyTo: deps.customerReplyTo,
        kind: "customer",
      })
      .catch(() => false);
  }
  return { ok: true, status: "rejected", emailed, via: emailed ? "email" : null };
}

/** A booked job is cancelled: off the calendar, status cancelled. */
export async function cancelAction(input: { reference: string; reason: string; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const now = (deps.now ?? (() => new Date()))();
  const ok = await deps.jobs.update(q.reference, allowedFrom("cancel"), {
    jobStatus: "cancelled",
    statusUpdatedAt: now,
    bookingStatus: "cancelled",
    closedReason: input.reason,
    closedBy: input.by,
  });
  if (!ok) return notAllowed(q.jobStatus);
  await deps.jobs.cancelCalendar(q.reference);
  // A driver who was told about the job is told it's off.
  const driver = await deps.notifyDriver?.({ quoteReference: q.reference }).catch(() => undefined);
  return { ok: true, status: "cancelled", emailed: false, via: null, driverNotice: driver };
}

/** The move is done: record what was actually charged on the day. */
export async function completeAction(input: { reference: string; finalAmountAud: number; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const now = (deps.now ?? (() => new Date()))();
  const ok = await deps.jobs.update(q.reference, allowedFrom("complete"), {
    jobStatus: "completed",
    statusUpdatedAt: now,
    finalAmountAud: input.finalAmountAud,
    completedAt: now,
    closedBy: input.by,
  });
  return ok ? { ok: true, status: "completed", emailed: false, via: null } : notAllowed(q.jobStatus);
}

/** The customer didn't go ahead. */
export async function markLostAction(input: { reference: string; reason: string; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const now = (deps.now ?? (() => new Date()))();
  const ok = await deps.jobs.update(q.reference, allowedFrom("markLost"), {
    jobStatus: "lost",
    statusUpdatedAt: now,
    bookingStatus: null,
    closedReason: input.reason,
    closedBy: input.by,
  });
  return ok ? { ok: true, status: "lost", emailed: false, via: null } : notAllowed(q.jobStatus);
}

/** Undo a close: back to where it was before (quoted, estimate or waiting). */
export async function reopenAction(input: { reference: string; by: string }, deps: JobDeps): Promise<ActionResult> {
  const q = await deps.jobs.find(input.reference);
  if (!q) return notFound;
  const status: JobStatus = q.quoteSentAt ? "quoted" : q.amountAud !== null ? "estimate_sent" : "waiting_for_quote";
  const now = (deps.now ?? (() => new Date()))();
  const ok = await deps.jobs.update(q.reference, allowedFrom("reopen"), { jobStatus: status, statusUpdatedAt: now, closedReason: null, closedBy: input.by });
  return ok ? { ok: true, status, emailed: false, via: null } : notAllowed(q.jobStatus);
}

class StatusChanged extends Error {}

export const dbJobStore: JobStore = {
  async find(reference) {
    const [row] = await getDb().select().from(quotes).where(eq(quotes.reference, reference.trim().toUpperCase())).limit(1);
    return row ?? null;
  },
  async update(reference, from, patch) {
    const rows = await getDb()
      .update(quotes)
      .set(patch)
      .where(and(eq(quotes.reference, reference), inArray(quotes.jobStatus, [...from])))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
  loadCapacity: (date) => loadCapacity(date),
  async book(reference, from, date, decide, patch) {
    // A job is in the calendar once (quote_reference is unique): clear an earlier cancelled row.
    await getDb().delete(bookings).where(and(eq(bookings.quoteReference, reference), eq(bookings.status, "cancelled")));
    try {
      return await reserve(date, decide, async (tx) => {
        const rows = await tx
          .update(quotes)
          .set(patch)
          .where(and(eq(quotes.reference, reference), inArray(quotes.jobStatus, [...from])))
          .returning({ reference: quotes.reference });
        if (!rows.length) throw new StatusChanged(); // rolls the calendar insert back
      });
    } catch (err) {
      if (err instanceof StatusChanged) return null;
      throw err;
    }
  },
  async cancelCalendar(reference) {
    await getDb().update(bookings).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(bookings.quoteReference, reference));
  },
};
