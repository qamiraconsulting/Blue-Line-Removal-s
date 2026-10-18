import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { dayAfter } from "../../lib/noticeTiming.js";
import { melbourneNowLocal } from "../capacity/store.js";
import { getDb } from "../db/client.js";
import { bookings } from "../db/schema.js";
import { syncCustomerNoticeSafely, type CustomerNoticeDeps } from "./customerNotice.js";
import { syncDriverNoticeSafely, type DriverNoticeDeps } from "./driverNotice.js";

// The hourly job (api/cron/notices.ts) and the dashboard's "Send due emails now" button: finds
// the confirmed bookings whose driver or customer email hasn't gone out yet and whose day-before
// has come, and sends them. Safe to run as often as you like -- an email already sent is never
// repeated (see driverNotice.ts / customerNotice.ts).

export interface DueNoticeDeps {
  driver: DriverNoticeDeps;
  customer: CustomerNoticeDeps;
  now?: () => Date;
}

export interface DueNoticeSummary {
  checked: number;
  driverEmails: number;
  customerEmails: number;
}

export async function sendDueNotices(deps: DueNoticeDeps): Promise<DueNoticeSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const today = melbourneNowLocal(now).slice(0, 10);
  // The day before is today or earlier for any move today or tomorrow.
  const lastMove = dayAfter(today);
  const pending = await getDb()
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.date, today),
        lte(bookings.date, lastMove),
        or(isNull(bookings.driverNotice), and(eq(bookings.customerNoticeWanted, true), isNull(bookings.customerNotice))),
      ),
    );

  const summary: DueNoticeSummary = { checked: pending.length, driverEmails: 0, customerEmails: 0 };
  for (const { id } of pending) {
    const d = await syncDriverNoticeSafely({ bookingId: id }, { ...deps.driver, now: deps.now }, { mode: "cron" });
    if (d.status === "sent") summary.driverEmails += 1;
    const c = await syncCustomerNoticeSafely({ bookingId: id }, { ...deps.customer, now: deps.now }, { mode: "cron" });
    if (c.status === "sent") summary.customerEmails += 1;
  }
  return summary;
}
