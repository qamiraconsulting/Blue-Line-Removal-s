import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { DRIVER_NEEDED_DAYS_BEFORE } from "../../lib/drivers.js";
import { getDb } from "../db/client.js";
import { bookings, trucks } from "../db/schema.js";
import { formatArrivalTime } from "../quote/bookingEmails.js";
import { esc, formatDateLabel, shell, type EmailContent } from "../quote/emails.js";
import type { OutgoingEmail } from "../quote/service.js";

// "No driver yet" alert (Blue Line, 28 Oct 2026): the dispatcher picks the driver for each job
// by hand. If a confirmed job still has no driver 2 days before the move, the team is emailed
// (bluelineremovalsau@gmail.com unless DISPATCH_ALERT_EMAIL says otherwise) and the job is
// flagged on the Booking and trucks tab. Runs with the hourly job (dueNotices.ts) and the
// dashboard's "Send due emails now". Each job is only emailed about once; picking a driver
// clears it, so removing the driver again would alert again.

export const DEFAULT_DISPATCH_ALERT_EMAIL = "bluelineremovalsau@gmail.com";

export interface DriverlessJob {
  id: string;
  date: string;
  arrivalTime: string;
  truckLabel: string | null;
  truckType: string;
  customerName: string | null;
  fromText: string | null;
  toText: string | null;
  quoteReference: string | null;
}

export interface NoDriverStore {
  /** Confirmed jobs from `from` to `to` with no driver picked and no alert sent yet. */
  findDue(from: string, to: string): Promise<DriverlessJob[]>;
  markSent(ids: string[], at: Date): Promise<void>;
}

export interface NoDriverAlertDeps {
  store: NoDriverStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  /** Where the alert goes (on previews: the test inbox). */
  to: string;
  /** The dashboard's Booking and trucks tab, for the link in the email. */
  dashboardUrl: string | null;
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export function renderNoDriverAlert(jobs: DriverlessJob[], dashboardUrl: string | null): EmailContent {
  const n = jobs.length;
  const subject = `Driver needed: ${n} job${n === 1 ? "" : "s"} in the next ${DRIVER_NEEDED_DAYS_BEFORE} days ${n === 1 ? "has" : "have"} no driver`;
  const line = (j: DriverlessJob) =>
    `${formatDateLabel(j.date)}, ${formatArrivalTime(j.arrivalTime)} -- ${j.truckLabel ?? j.truckType} -- ${j.customerName ?? "customer"}` +
    `${j.fromText || j.toText ? ` (${[j.fromText, j.toText].filter(Boolean).join(" to ")})` : ""}${j.quoteReference ? ` -- ${j.quoteReference}` : ""}`;
  const intro = `These confirmed jobs still have no driver. Please pick one on the Booking and trucks tab -- the driver is emailed the job the day before the move.`;
  const text = [intro, "", ...jobs.map((j) => `- ${line(j)}`), ...(dashboardUrl ? ["", dashboardUrl] : [])].join("\n");
  const html = shell(
    `<p style="margin:0 0 12px">${esc(intro)}</p><ul style="margin:0 0 12px;padding-left:20px">${jobs.map((j) => `<li>${esc(line(j))}</li>`).join("")}</ul>` +
      (dashboardUrl ? `<p style="margin:0"><a href="${esc(dashboardUrl)}">Open Booking and trucks</a></p>` : ""),
  );
  return { subject, text, html };
}

/** Emails the team about jobs within 2 days that still have no driver. Returns how many jobs were included. */
export async function sendNoDriverAlerts(deps: NoDriverAlertDeps, today: string, now: Date): Promise<number> {
  const jobs = await deps.store.findDue(today, addDays(today, DRIVER_NEEDED_DAYS_BEFORE));
  if (!jobs.length) return 0;
  const sent = await deps.sendEmail({ ...renderNoDriverAlert(jobs, deps.dashboardUrl), to: deps.to, kind: "team" });
  if (!sent) return 0;
  await deps.store.markSent(
    jobs.map((j) => j.id),
    now,
  );
  return jobs.length;
}

export const dbNoDriverStore: NoDriverStore = {
  async findDue(from, to) {
    const db = getDb();
    const rows = await db
      .select({
        id: bookings.id,
        date: bookings.date,
        arrivalTime: bookings.arrivalTime,
        truckId: bookings.truckId,
        truckType: bookings.truckType,
        customerName: bookings.customerName,
        fromText: bookings.fromText,
        toText: bookings.toText,
        quoteReference: bookings.quoteReference,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "confirmed"),
          gte(bookings.date, from),
          lte(bookings.date, to),
          isNull(bookings.driverId),
          isNull(bookings.driverName),
          isNull(bookings.noDriverAlertSentAt),
        ),
      );
    const truckRows = rows.length ? await db.select({ id: trucks.id, label: trucks.label }).from(trucks) : [];
    return rows
      .map(({ truckId, ...r }) => ({ ...r, truckLabel: truckRows.find((t) => t.id === truckId)?.label ?? null }))
      .sort((a, b) => (a.date + a.arrivalTime).localeCompare(b.date + b.arrivalTime));
  },
  async markSent(ids, at) {
    if (ids.length) await getDb().update(bookings).set({ noDriverAlertSentAt: at }).where(inArray(bookings.id, ids));
  },
};
