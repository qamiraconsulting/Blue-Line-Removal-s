import { eq } from "drizzle-orm";
import { noticeTiming, shortDay, type NoticeMode } from "../../lib/noticeTiming.js";
import { melbourneNowLocal } from "../capacity/store.js";
import { fromMinutes, toMinutes } from "../../lib/truckTrips.js";
import { resolveDriver, type DriverLike, type ResolvedDriver } from "../../lib/drivers.js";
import { getDb } from "../db/client.js";
import { bookings, drivers, quotes, trucks, type DriverNoticeSnapshot } from "../db/schema.js";
import { formatArrivalTime } from "../quote/bookingEmails.js";
import { esc, firstName, formatDateLabel, shell, type EmailContent } from "../quote/emails.js";
import { customerRecipient, type OutgoingEmail } from "../quote/service.js";

// Telling the driver about a job (Ayesha, 2026-10-16). Whenever a booking is confirmed -- by the
// chat, by the team on the dashboard, or entered from a phone call -- the driver picked for it
// is emailed the date, time, pick-up, drop-off and the customer's details. Drivers are picked per
// job by hand (Blue Line, 28 Oct); until one is picked nobody is emailed and the job is flagged.
//
// syncDriverNotice() is safe to call after ANY change to the calendar: it compares the trip as
// it is now with what the driver was last told, and only emails when something differs --
// a new job, a changed job, a different driver (old one told they're off it), or a cancellation.
// The driver never sees a price.
//
// Timing (Ayesha, 2026-10-18): the first "New job" email is NOT sent when the truck and driver
// are assigned but the day before the move (straight away if that day is today or has passed) --
// see src/lib/noticeTiming.ts. Until then nothing is stored: the email is built from the booking
// as it is at send time, so a new date, driver or truck before then is picked up and a cancelled
// booking sends nothing. Once the driver has been told, any change is sent straight away.

export interface TripForNotice {
  id: string;
  status: string; // "confirmed" | "cancelled"
  quoteReference: string | null;
  date: string;
  arrivalTime: string;
  estimatedMinutes: number;
  movers: number;
  truckLabel: string | null;
  customerName: string | null;
  phone: string | null;
  customerEmail: string | null;
  fromText: string | null;
  toText: string | null;
  notes: string | null;
  driver: ResolvedDriver | null;
  /** A test-mode estimate: drivers are never emailed, only the preview's test inbox. */
  testMode: boolean;
  previous: DriverNoticeSnapshot | null;
}

export type NoticeTarget = { bookingId: string } | { quoteReference: string };

export interface DriverNoticeStore {
  find(target: NoticeTarget): Promise<TripForNotice | null>;
  /** Remembers what the driver was last told (null = nothing outstanding). */
  save(bookingId: string, snapshot: DriverNoticeSnapshot | null): Promise<void>;
}

export interface DriverNoticeDeps {
  store: DriverNoticeStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  replyTo: string;
  testEmailTo?: string | null;
  /** Not the live site (a preview or local): drivers are never emailed, only the test inbox. */
  nonProduction?: boolean;
  now?: () => Date;
}

export type DriverNoticeResult =
  | { status: "sent"; kind: "new" | "update" | "cancelled" | "reassigned"; to: string }
  | { status: "unchanged" }
  /** Not due yet: it goes out on `on` (the day before the move). */
  | { status: "scheduled"; on: string }
  /** Nobody could be told; `why` says what the team needs to fix. */
  | { status: "not_notified"; why: "no_trip" | "no_truck" | "no_driver" | "driver_has_no_email" | "driver_inactive" | "test_mode" | "email_failed" };

export const NOTICE_WHY: Record<string, string> = {
  no_truck: "no truck is assigned yet",
  no_driver: "no driver picked yet",
  driver_has_no_email: "the driver has no email address on file",
  driver_inactive: "the driver is marked inactive",
  test_mode: "test booking (not sent to real drivers)",
  email_failed: "the email couldn't be sent",
  no_trip: "booking not found",
};

/** One line for the team: did the driver get told? null = nothing worth saying. */
export function driverNoticeLine(result: DriverNoticeResult | undefined, driverName?: string | null): string | null {
  if (!result || result.status === "unchanged") return null;
  if (result.status === "scheduled") return `Driver email scheduled for ${shortDay(result.on)} (the day before the move).`;
  if (result.status === "sent") {
    const what = { new: "emailed the job", update: "emailed the changes", cancelled: "emailed that the job is off", reassigned: "emailed that the job is off" }[result.kind];
    return `Driver ${what}.`;
  }
  if (result.why === "no_trip") return null;
  return `Driver NOT emailed: ${NOTICE_WHY[result.why] ?? result.why}${driverName ? ` (${driverName})` : ""}.`;
}

// --------------------------------------------------------------------------- what's compared

const FIELDS: { key: keyof DriverNoticeSnapshot; label: string; show: (s: DriverNoticeSnapshot) => string }[] = [
  { key: "date", label: "Date", show: (s) => formatDateLabel(s.date) },
  { key: "arrivalTime", label: "Arrive at", show: (s) => formatArrivalTime(s.arrivalTime) },
  { key: "estimatedMinutes", label: "Expected finish", show: (s) => finishText(s) },
  { key: "truckLabel", label: "Truck", show: (s) => s.truckLabel },
  { key: "fromText", label: "Pick-up", show: (s) => s.fromText ?? "-" },
  { key: "toText", label: "Drop-off", show: (s) => s.toText ?? "-" },
  { key: "customerName", label: "Customer", show: (s) => s.customerName ?? "-" },
  { key: "phone", label: "Customer phone", show: (s) => s.phone ?? "-" },
  { key: "customerEmail", label: "Customer email", show: (s) => s.customerEmail ?? "-" },
  { key: "notes", label: "Notes", show: (s) => s.notes ?? "-" },
];

const finishText = (s: Pick<DriverNoticeSnapshot, "arrivalTime" | "estimatedMinutes">) =>
  `about ${formatArrivalTime(fromMinutes((toMinutes(s.arrivalTime) + s.estimatedMinutes) % (24 * 60)))}`;

export function snapshotOf(trip: TripForNotice, driver: DriverLike, now: Date): DriverNoticeSnapshot {
  return {
    driverId: driver.id,
    driverName: driver.name,
    driverEmail: driver.email ?? "",
    date: trip.date,
    arrivalTime: trip.arrivalTime,
    estimatedMinutes: trip.estimatedMinutes,
    truckLabel: trip.truckLabel ?? "",
    customerName: trip.customerName,
    phone: trip.phone,
    customerEmail: trip.customerEmail,
    fromText: trip.fromText,
    toText: trip.toText,
    notes: trip.notes,
    sentAt: now.toISOString(),
  };
}

/** What changed since the driver was last told (empty = nothing the driver needs to know). */
export function noticeChanges(before: DriverNoticeSnapshot, after: DriverNoticeSnapshot): { label: string; was: string; now: string }[] {
  return FIELDS.filter((f) => before[f.key] !== after[f.key])
    .map((f) => ({ label: f.label, was: f.show(before), now: f.show(after) }))
    .filter((c) => c.was !== c.now);
}

// --------------------------------------------------------------------------------- the emails

function detailRows(s: DriverNoticeSnapshot, movers: number, reference: string | null): [string, string][] {
  const rows: [string, string][] = [
    ["Date", formatDateLabel(s.date)],
    ["Arrive at", formatArrivalTime(s.arrivalTime)],
    ["Expected finish", finishText(s)],
    ["Truck", s.truckLabel],
    ["Crew", movers ? `${movers} movers` : ""],
    ["Pick-up", s.fromText ?? ""],
    ["Drop-off", s.toText ?? ""],
    ["Customer", s.customerName ?? ""],
    ["Customer phone", s.phone ?? ""],
    ["Customer email", s.customerEmail ?? ""],
    ["Notes", s.notes ?? ""],
    ["Reference", reference ?? ""],
  ];
  return rows.filter(([, v]) => Boolean(v));
}

function build(opening: string, subject: string, driverName: string, rows: [string, string][], extra: string[] = []): EmailContent {
  const text = [`Hi ${firstName(driverName)},`, "", opening, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", ...extra.flatMap((l) => [l, ""]), "Blue Line Removals"].join("\n");
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c;vertical-align:top">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(driverName))},</p>
<p style="margin:0 0 14px">${esc(opening)}</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${table}</table>
${extra.map((l) => `<p style="margin:0 0 10px;font-size:13px;color:#5b6b7c">${esc(l)}</p>`).join("")}`);
  return { subject, text, html };
}

const when = (s: DriverNoticeSnapshot) => `${formatDateLabel(s.date)}, ${formatArrivalTime(s.arrivalTime)}`;
const who = (s: DriverNoticeSnapshot) => s.customerName || "customer";

export function renderDriverNewJob(s: DriverNoticeSnapshot, trip: Pick<TripForNotice, "movers" | "quoteReference">): EmailContent {
  return build(
    "You've been assigned a job. Here are the details:",
    `New job: ${when(s)} - ${who(s)}`,
    s.driverName,
    detailRows(s, trip.movers, trip.quoteReference),
    ["The team will confirm the final charges with the customer on the day. Questions? Call the office."],
  );
}

export function renderDriverUpdate(
  s: DriverNoticeSnapshot,
  changes: { label: string; was: string; now: string }[],
  trip: Pick<TripForNotice, "movers" | "quoteReference">,
): EmailContent {
  return build(
    "A job you're driving has changed. What changed:",
    `Job updated: ${when(s)} - ${who(s)}`,
    s.driverName,
    changes.map((c): [string, string] => [c.label, `${c.now} (was ${c.was})`]),
    ["The job as it stands now:", ...detailRows(s, trip.movers, trip.quoteReference).map(([k, v]) => `${k}: ${v}`)],
  );
}

export function renderDriverOffJob(s: DriverNoticeSnapshot, reason: "cancelled" | "reassigned", trip: Pick<TripForNotice, "movers" | "quoteReference">): EmailContent {
  return build(
    reason === "cancelled" ? "This job has been cancelled -- you don't need to do it:" : "You are no longer driving this job -- someone else has it:",
    `${reason === "cancelled" ? "Job cancelled" : "Job reassigned"}: ${when(s)} - ${who(s)}`,
    s.driverName,
    detailRows(s, trip.movers, trip.quoteReference),
  );
}

// ------------------------------------------------------------------------------------ the sync

export async function syncDriverNotice(target: NoticeTarget, deps: DriverNoticeDeps, opts: { mode?: NoticeMode } = {}): Promise<DriverNoticeResult> {
  const trip = await deps.store.find(target);
  if (!trip) return { status: "not_notified", why: "no_trip" };
  const now = (deps.now ?? (() => new Date()))();
  const prev = trip.previous;
  const testMode = trip.testMode || Boolean(deps.nonProduction);

  const driver = trip.driver?.driver ?? null;
  let blocker: Extract<DriverNoticeResult, { status: "not_notified" }>["why"] | null = null;
  if (!trip.truckLabel) blocker = "no_truck";
  else if (!trip.driver) blocker = "no_driver";
  else if (!driver) blocker = "driver_has_no_email"; // an older typed name has no record
  else if (!driver.email) blocker = "driver_has_no_email";
  else if (!driver.active) blocker = "driver_inactive";
  const want = trip.status === "confirmed" && !blocker && driver ? snapshotOf(trip, driver, now) : null;

  const deliver = (to: string, content: EmailContent) => {
    const address = customerRecipient(to, testMode, deps.testEmailTo);
    if (!address) return Promise.resolve<boolean | "test">("test");
    return deps
      .sendEmail({ ...content, subject: testMode ? `[TEST] ${content.subject}` : content.subject, to: address, replyTo: deps.replyTo, kind: "driver" })
      .catch(() => false);
  };

  // 1. The driver who was told, and now isn't on the job (cancelled, or someone else has it).
  if (prev && (!want || want.driverId !== prev.driverId)) {
    const reason = trip.status === "confirmed" ? "reassigned" : "cancelled";
    const sent = await deliver(prev.driverEmail, renderDriverOffJob(prev, reason, trip));
    if (sent === true) {
      await deps.store.save(trip.id, null);
      if (!want) return { status: "sent", kind: reason, to: prev.driverEmail };
    } else if (!want) {
      return { status: "not_notified", why: sent === "test" ? "test_mode" : "email_failed" };
    }
  }

  if (!want) {
    // Nothing outstanding to tell anyone. Say why a confirmed job has nobody to tell.
    return trip.status === "confirmed" && blocker ? { status: "not_notified", why: blocker } : { status: "unchanged" };
  }

  // 2. The driver who should do it.
  const current = prev && prev.driverId === want.driverId ? prev : null;
  if (!current) {
    // The first email waits for the day before the move (see the top of this file).
    const timing = noticeTiming(trip.date, melbourneNowLocal(now), opts.mode ?? "assign");
    if (!timing.due) return { status: "scheduled", on: timing.sendOn };
    const sent = await deliver(want.driverEmail, renderDriverNewJob(want, trip));
    if (sent !== true) return { status: "not_notified", why: sent === "test" ? "test_mode" : "email_failed" };
    await deps.store.save(trip.id, want);
    return { status: "sent", kind: "new", to: want.driverEmail };
  }
  const changes = noticeChanges(current, want);
  if (changes.length === 0) return { status: "unchanged" };
  const sent = await deliver(want.driverEmail, renderDriverUpdate(want, changes, trip));
  if (sent !== true) return { status: "not_notified", why: sent === "test" ? "test_mode" : "email_failed" };
  await deps.store.save(trip.id, want);
  return { status: "sent", kind: "update", to: want.driverEmail };
}

/** Never throws: telling the driver must not undo or fail a booking that has been made. */
export async function syncDriverNoticeSafely(target: NoticeTarget, deps: DriverNoticeDeps, opts: { mode?: NoticeMode } = {}): Promise<DriverNoticeResult> {
  try {
    return await syncDriverNotice(target, deps, opts);
  } catch (err) {
    console.error("Driver notice failed:", err instanceof Error ? err.message : "unknown error");
    return { status: "not_notified", why: "email_failed" };
  }
}

// ---------------------------------------------------------------------------------- database

export const dbDriverNoticeStore: DriverNoticeStore = {
  async find(target) {
    const db = getDb();
    const [b] = await db
      .select()
      .from(bookings)
      .where("bookingId" in target ? eq(bookings.id, target.bookingId) : eq(bookings.quoteReference, target.quoteReference))
      .limit(1);
    if (!b) return null;
    const [truckRows, driverRows, [q]] = await Promise.all([
      db.select({ id: trucks.id, label: trucks.label }).from(trucks),
      db.select().from(drivers),
      b.quoteReference
        ? db.select({ email: quotes.email, source: quotes.source, rateCardStatus: quotes.rateCardStatus }).from(quotes).where(eq(quotes.reference, b.quoteReference)).limit(1)
        : Promise.resolve([]),
    ]);
    return {
      id: b.id,
      status: b.status,
      quoteReference: b.quoteReference,
      date: b.date,
      arrivalTime: b.arrivalTime,
      estimatedMinutes: b.estimatedMinutes,
      movers: b.movers,
      truckLabel: truckRows.find((t) => t.id === b.truckId)?.label ?? null,
      customerName: b.customerName,
      phone: b.phone,
      customerEmail: b.customerEmail ?? q?.email ?? null,
      fromText: b.fromText,
      toText: b.toText,
      notes: b.notes,
      driver: resolveDriver(b, driverRows),
      testMode: Boolean(q && q.source !== "team_form" && q.rateCardStatus !== "confirmed"),
      previous: b.driverNotice ?? null,
    };
  },
  async save(bookingId, snapshot) {
    await getDb().update(bookings).set({ driverNotice: snapshot }).where(eq(bookings.id, bookingId));
  },
};
