import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { bookings, quotes } from "../db/schema.js";
import { finishLines, type QuoteLines } from "../jobs/lines.js";
import type { JobStatus } from "../jobs/status.js";
import { truckIds, type TruckId } from "../quote/rateCard.js";
import { normalisePhone } from "../quote/service.js";

// Matt's Google Form (phone, Airtasker, Moval and other jobs) -> Neon. His Apps Script still
// makes and emails the PDF quote exactly as before; one extra step at the end of the script
// posts the row here (docs/apps-script/blr-website-additions.gs), so his quotes and bookings get
// the same status, show on the dashboard and block the truck in the calendar.
//
// The sheet's columns are matched loosely by header words, like the script's own getVal_(), so
// a re-worded header still works. Nothing is guessed: a booked job missing its arrival time,
// truck size or hours is recorded as booked but flagged "not in the calendar" for the team.

export interface TeamFormPayload {
  /** Form responses row, by header (dates already formatted by the script). */
  data: Record<string, unknown>;
  /** The values the script put in the PDF (CustomerName, Total, BookingNo, ...). */
  values: Record<string, unknown>;
  moveDateIso?: string | null; // yyyy-mm-dd
  arrivalTime?: string | null; // HH:mm
}

export interface TeamFormJob {
  externalRef: string;
  linkedReference: string | null;
  customerName: string;
  phone: string;
  email: string;
  need: "moving" | "junk";
  jobDescription: string | null;
  fromText: string | null;
  toText: string | null;
  movingDate: string | null;
  arrivalTime: string | null;
  truck: TruckId | null;
  movers: number | null;
  lines: QuoteLines;
  status: JobStatus;
  channel: string;
  platformJobNumber: string | null;
  finalAmountAud: number | null;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  const n = Number(str(v).replace(/[$,\s]/g, ""));
  return str(v) !== "" && Number.isFinite(n) ? n : null;
};

/** First value whose header contains `needle` (case-insensitive) -- like the script's getVal_. */
export function field(row: Record<string, unknown>, needle: string): unknown {
  const n = needle.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase().includes(n));
  return key === undefined ? "" : row[key];
}

export function parseStatus(bookingStatus: string): JobStatus {
  const s = bookingStatus.toLowerCase();
  if (s.includes("not")) return "quoted"; // "Not Confirmed"
  if (s.includes("complete")) return "completed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("confirm") || s.includes("booked")) return "booked";
  return "quoted";
}

export function parseChannel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("airtasker")) return "airtasker";
  if (s.includes("moval")) return "moval";
  if (s.includes("phone") || s.includes("call")) return "phone";
  if (s.includes("website")) return "website_followup";
  return "other";
}

export function parseTruck(value: string): TruckId | null {
  const s = value.toLowerCase().replace(/\s/g, "");
  if (s.startsWith("4.5")) return "4.5T";
  if (s.startsWith("6-8") || s.startsWith("6–8") || s.startsWith("6to8")) return "6-8T";
  if (s.startsWith("10")) return "10T";
  return (truckIds as readonly string[]).includes(value) ? (value as TruckId) : null;
}

/** "2 men 1 truck" -> 2. */
export function parseMovers(crew: string): number | null {
  const m = crew.match(/(\d+)\s*(men|man|movers?|people|crew)/i);
  return m ? Number(m[1]) : null;
}

export function parseTeamForm(p: TeamFormPayload): { ok: true; job: TeamFormJob } | { ok: false; error: string } {
  const v = p.values;
  const externalRef = str(v.BookingNo).toUpperCase();
  const email = str(v.Email);
  const name = str(v.CustomerName);
  if (!externalRef || externalRef === "—") return { ok: false, error: "No booking number in the row." };
  if (!name || !email) return { ok: false, error: "No customer name or email in the row." };

  const total = num(v.Total);
  if (total === null) return { ok: false, error: "No total in the row." };

  const jobType = str(field(p.data, "job type"));
  const items = str(field(p.data, "items"));
  const hours = num(v.Hours);
  const movers = parseMovers(str(v.Crew));
  const truck = parseTruck(str(field(p.data, "truck size")));
  const split = finishLines(
    {
      truck,
      movers,
      hours,
      rateHr: num(v.RateHr),
      stairFlights: num(v.StairFlights) ?? 0,
      labour: num(v.Labour) ?? 0,
      callOut: num(v.CallOut) ?? 0,
      packing: num(v.Packing) ?? 0,
      stair: num(v.Stair) ?? 0,
      services: str(v.Services) || "Standard Move",
    },
    total,
    10,
  );
  // Keep the sheet's own subtotal and GST when it has them.
  const subtotal = num(v.Subtotal);
  const gst = num(v.GST);
  const lines: QuoteLines =
    subtotal !== null && gst !== null
      ? { ...split, subtotal, gst, adjustment: Math.round((subtotal - (split.labour + split.callOut + split.packing + split.stair)) * 100) / 100 }
      : split;

  const linked = str(field(p.data, "website or chat reference")).toUpperCase();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str(p.moveDateIso)) ? str(p.moveDateIso) : null;
  const arrival = /^\d{2}:\d{2}$/.test(str(p.arrivalTime)) ? str(p.arrivalTime) : null;

  return {
    ok: true,
    job: {
      externalRef,
      linkedReference: /^BLR-\d{8}-[A-F0-9]{6}$/.test(linked) ? linked : null,
      customerName: name,
      phone: str(v.Contact),
      email,
      need: /junk/i.test(jobType) ? "junk" : "moving",
      jobDescription: [jobType, items].filter(Boolean).join(" -- ") || null,
      fromText: str(v.Pickup) || null,
      toText: str(v.Delivery) || null,
      movingDate: iso,
      arrivalTime: arrival,
      truck,
      movers,
      lines,
      status: parseStatus(str(v.BookingStatus)),
      channel: parseChannel(str(field(p.data, "source"))),
      platformJobNumber: str(field(p.data, "platform job number")) || null,
      finalAmountAud: num(field(p.data, "final amount")),
    },
  };
}

/** Why a booked job can't go in the calendar, or null if it can. */
export function calendarProblem(job: TeamFormJob): string | null {
  const missing = [
    !job.movingDate && "date",
    !job.arrivalTime && "arrival time",
    !job.truck && "truck size",
    !job.movers && "number of movers (Crew)",
    !job.lines.hours && "hours",
  ].filter(Boolean);
  return missing.length ? `Not in the calendar -- Matt's form is missing: ${missing.join(", ")}` : null;
}

export type IntakeResult = { ok: true; reference: string; status: JobStatus; calendar: string } | { ok: false; error: string };

/** Creates or updates the job (linking it to the website/chat request if Matt gave its reference) and its calendar slot. */
export async function saveTeamFormJob(job: TeamFormJob): Promise<IntakeResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Same lock as the chat's bookings, so the two can't take the same truck at once.
    if (job.movingDate) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`blr-booking-${job.movingDate}`}))`);

    const now = new Date();
    const problem = job.status === "booked" ? calendarProblem(job) : null;
    const common = {
      externalRef: job.externalRef,
      channel: job.channel,
      platformJobNumber: job.platformJobNumber,
      customerName: job.customerName,
      phone: job.phone,
      email: job.email,
      emailNormalised: job.email.toLowerCase(),
      phoneNormalised: normalisePhone(job.phone),
      fromText: job.fromText,
      toText: job.toText,
      movingDate: job.movingDate,
      bookingArrivalTime: job.arrivalTime,
      truck: job.truck,
      movers: job.movers,
      quoteLines: job.lines,
      quotedAmountAud: Math.round(job.lines.total),
      quoteSentAt: now,
      quoteSentBy: "google_form",
      jobStatus: job.status,
      statusUpdatedAt: now,
      bookingStatus: job.status === "booked" || job.status === "completed" ? "confirmed" : job.status === "cancelled" ? "cancelled" : null,
      calendarIssue: problem,
      ...(job.status === "completed" ? { completedAt: now, finalAmountAud: job.finalAmountAud ?? Math.round(job.lines.total) } : {}),
    };

    // 1. Matt quoted a website/chat request: update that one (closes its "waiting for quote").
    // 2. Else the same sheet booking number again (an edited response): update it.
    // 3. Else a new job, under the sheet's own booking number.
    let reference: string | null = null;
    if (job.linkedReference) {
      const [linked] = await tx.select({ reference: quotes.reference }).from(quotes).where(eq(quotes.reference, job.linkedReference)).limit(1);
      if (linked) {
        // The sheet number now lives on the linked row; drop it from any row that had it.
        await tx.update(quotes).set({ externalRef: null }).where(and(eq(quotes.externalRef, job.externalRef), ne(quotes.reference, linked.reference)));
        await tx.update(quotes).set(common).where(eq(quotes.reference, linked.reference));
        reference = linked.reference;
      }
    }
    if (!reference) {
      const [existing] = await tx.select({ reference: quotes.reference }).from(quotes).where(eq(quotes.externalRef, job.externalRef)).limit(1);
      if (existing) {
        await tx.update(quotes).set(common).where(eq(quotes.reference, existing.reference));
        reference = existing.reference;
      } else {
        await tx.insert(quotes).values({
          ...common,
          reference: job.externalRef,
          source: "team_form",
          status: "team_quote",
          need: job.need,
          jobDescription: job.jobDescription,
          rateCardVersion: "team-quote",
          rateCardStatus: "team",
          inputs: { from: "google_form" },
          rateCardSnapshot: {},
        });
        reference = job.externalRef;
      }
    }

    // The calendar slot.
    const [slot] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.quoteReference, reference)).limit(1);
    let calendar = "none";
    if ((job.status === "booked" || job.status === "completed") && !problem) {
      const row = {
        source: job.channel,
        status: "confirmed",
        quoteReference: reference,
        date: job.movingDate!,
        arrivalTime: job.arrivalTime!,
        estimatedMinutes: Math.round(job.lines.hours! * 60),
        truckType: job.truck!,
        movers: job.movers!,
        customerName: job.customerName,
        phone: job.phone,
        fromText: job.fromText,
        toText: job.toText,
        notes: job.platformJobNumber ? `Platform job ${job.platformJobNumber}` : null,
        createdBy: "google_form",
        cancelledAt: null,
      };
      if (slot) await tx.update(bookings).set(row).where(eq(bookings.id, slot.id));
      else await tx.insert(bookings).values(row);
      calendar = slot ? "updated" : "added";
    } else if (slot && job.status === "cancelled") {
      await tx.update(bookings).set({ status: "cancelled", cancelledAt: now }).where(eq(bookings.id, slot.id));
      calendar = "cancelled";
    } else if (problem) {
      calendar = problem;
    }
    return { ok: true, reference, status: job.status, calendar };
  });
}
