import { eq } from "drizzle-orm";
import { noticeTiming, shortDay, type NoticeMode } from "../../lib/noticeTiming.js";
import { melbourneNowLocal } from "../capacity/store.js";
import { getDb } from "../db/client.js";
import { bookings, type CustomerNoticeSnapshot } from "../db/schema.js";
import { renderManualBookingEmail } from "../quote/bookingEmails.js";
import { customerRecipient, type OutgoingEmail } from "../quote/service.js";
import type { NoticeTarget } from "./driverNotice.js";

// The customer's "Your move is booked" email for a booking made from the calendar -- a phone
// booking, or a trip set up on Truck trips -- when the team ticked "email the customer".
//
// Like the driver's "New job" email it goes out the DAY BEFORE the move (straight away if that
// day is today or has passed), in Melbourne time -- see src/lib/noticeTiming.ts. Until then it is
// only a tick on the booking; it is built from the booking as it is at send time, so a new date
// before then is picked up, and unticking it or cancelling the booking sends nothing. Once sent,
// a change of date, time or address is emailed straight away ("Your booking has been updated").
// Bookings the customer made themselves (chat / website form) already get their confirmation
// quote when they are confirmed and are not covered here.

export interface BookingForCustomerNotice {
  id: string;
  status: string; // "confirmed" | "cancelled"
  wanted: boolean;
  quoteReference: string | null;
  date: string;
  arrivalTime: string;
  customerName: string | null;
  customerEmail: string | null;
  fromText: string | null;
  toText: string | null;
  previous: CustomerNoticeSnapshot | null;
}

export interface CustomerNoticeStore {
  find(target: NoticeTarget): Promise<BookingForCustomerNotice | null>;
  save(bookingId: string, snapshot: CustomerNoticeSnapshot): Promise<void>;
}

export interface CustomerNoticeDeps {
  store: CustomerNoticeStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  replyTo: string;
  testEmailTo?: string | null;
  /** Not the live site: customers are never emailed, only the test inbox. */
  nonProduction?: boolean;
  now?: () => Date;
}

export type CustomerNoticeResult =
  | { status: "sent"; kind: "confirmed" | "rescheduled" }
  | { status: "unchanged" }
  | { status: "scheduled"; on: string }
  | { status: "not_notified"; why: "no_booking" | "test_inbox_not_set" | "email_failed" };

/** One line for the team, or null when there's nothing to say. */
export function customerNoticeLine(result: CustomerNoticeResult | undefined): string | null {
  if (!result || result.status === "unchanged") return null;
  if (result.status === "scheduled") return `Customer email scheduled for ${shortDay(result.on)} (the day before the move).`;
  if (result.status === "sent") return result.kind === "confirmed" ? "Customer emailed their booking." : "Customer emailed the changes.";
  if (result.why === "no_booking") return null;
  if (result.why === "test_inbox_not_set") return "Customer NOT emailed: this is the test link, so customer emails aren't sent.";
  return "Customer NOT emailed: the email couldn't be sent.";
}

const snapshotOf = (b: BookingForCustomerNotice, now: Date): CustomerNoticeSnapshot => ({
  email: b.customerEmail ?? "",
  date: b.date,
  arrivalTime: b.arrivalTime,
  fromText: b.fromText,
  toText: b.toText,
  sentAt: now.toISOString(),
});

const changed = (a: CustomerNoticeSnapshot, b: CustomerNoticeSnapshot) =>
  a.date !== b.date || a.arrivalTime !== b.arrivalTime || a.fromText !== b.fromText || a.toText !== b.toText;

export async function syncCustomerNotice(target: NoticeTarget, deps: CustomerNoticeDeps, opts: { mode?: NoticeMode } = {}): Promise<CustomerNoticeResult> {
  const booking = await deps.store.find(target);
  if (!booking) return { status: "not_notified", why: "no_booking" };
  // Unticked, cancelled, or no email: nothing to send (and nothing waiting).
  if (!booking.wanted || booking.status !== "confirmed" || !booking.customerEmail) return { status: "unchanged" };

  const now = (deps.now ?? (() => new Date()))();
  const want = snapshotOf(booking, now);
  const prev = booking.previous;

  let kind: "confirmed" | "rescheduled";
  if (!prev) {
    const timing = noticeTiming(booking.date, melbourneNowLocal(now), opts.mode ?? "assign");
    if (!timing.due) return { status: "scheduled", on: timing.sendOn };
    kind = "confirmed";
  } else if (changed(prev, want)) {
    kind = "rescheduled";
  } else {
    return { status: "unchanged" };
  }

  const testMode = Boolean(deps.nonProduction);
  const address = customerRecipient(booking.customerEmail, testMode, deps.testEmailTo);
  if (!address) return { status: "not_notified", why: "test_inbox_not_set" };
  const content = renderManualBookingEmail({
    name: booking.customerName,
    kind,
    date: booking.date,
    arrivalTime: booking.arrivalTime,
    from: booking.fromText,
    to: booking.toText,
    reference: booking.quoteReference,
  });
  const sent = await deps
    .sendEmail({ ...content, subject: testMode ? `[TEST] ${content.subject}` : content.subject, to: address, replyTo: deps.replyTo, kind: "customer" })
    .catch(() => false);
  if (!sent) return { status: "not_notified", why: "email_failed" };
  await deps.store.save(booking.id, want);
  return { status: "sent", kind };
}

/** Never throws: an email problem must not undo a booking. */
export async function syncCustomerNoticeSafely(target: NoticeTarget, deps: CustomerNoticeDeps, opts: { mode?: NoticeMode } = {}): Promise<CustomerNoticeResult> {
  try {
    return await syncCustomerNotice(target, deps, opts);
  } catch (err) {
    console.error("Customer notice failed:", err instanceof Error ? err.message : "unknown error");
    return { status: "not_notified", why: "email_failed" };
  }
}

// ---------------------------------------------------------------------------------- database

export const dbCustomerNoticeStore: CustomerNoticeStore = {
  async find(target) {
    const [b] = await getDb()
      .select()
      .from(bookings)
      .where("bookingId" in target ? eq(bookings.id, target.bookingId) : eq(bookings.quoteReference, target.quoteReference))
      .limit(1);
    if (!b) return null;
    return {
      id: b.id,
      status: b.status,
      wanted: b.customerNoticeWanted,
      quoteReference: b.quoteReference,
      date: b.date,
      arrivalTime: b.arrivalTime,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      fromText: b.fromText,
      toText: b.toText,
      previous: b.customerNotice ?? null,
    };
  },
  async save(bookingId, snapshot) {
    await getDb().update(bookings).set({ customerNotice: snapshot }).where(eq(bookings.id, bookingId));
  },
};

