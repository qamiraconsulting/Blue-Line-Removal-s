import { describe, expect, it } from "vitest";
import type { CustomerNoticeSnapshot } from "../db/schema.js";
import { renderManualBookingEmail } from "../quote/bookingEmails.js";
import type { OutgoingEmail } from "../quote/service.js";
import { customerNoticeLine, syncCustomerNotice, type BookingForCustomerNotice, type CustomerNoticeStore } from "./customerNotice.js";

const NOW = new Date("2026-10-18T02:00:00Z"); // Sun 18 Oct, 1pm in Melbourne
const NINE_AM_19TH = new Date("2026-10-18T22:00:00Z"); // Mon 19 Oct 09:00 AEDT
const ONE_MIN_BEFORE = new Date("2026-10-18T21:59:00Z");

const booking = (over: Partial<BookingForCustomerNotice> = {}): BookingForCustomerNotice => ({
  id: "b-1",
  status: "confirmed",
  wanted: true,
  quoteReference: null,
  date: "2026-10-20",
  arrivalTime: "08:00",
  customerName: "Jane Smith",
  customerEmail: "jane@example.com",
  fromText: "4/12 Station St, Preston VIC 3072",
  toText: "5 High St, Brunswick VIC 3056",
  previous: null,
  ...over,
});

function setup(first: BookingForCustomerNotice, opts: { nonProduction?: boolean; testEmailTo?: string; fail?: boolean } = {}) {
  let current = first;
  const sent: OutgoingEmail[] = [];
  const store: CustomerNoticeStore = {
    find: async () => current,
    save: async (_id, snapshot: CustomerNoticeSnapshot) => {
      current = { ...current, previous: snapshot };
    },
  };
  const deps = {
    store,
    sendEmail: async (e: OutgoingEmail) => (opts.fail ? false : (sent.push(e), true)),
    replyTo: "hello@example.com",
    now: () => NOW,
    nonProduction: opts.nonProduction,
    testEmailTo: opts.testEmailTo,
  };
  return { deps, sent, change: (over: Partial<BookingForCustomerNotice>) => (current = { ...current, ...over }), now: () => current };
}

describe("the customer's booking email", () => {
  it("has no 'final charges' note -- just the details and the phone line", () => {
    const email = renderManualBookingEmail({ name: "Jane Smith", kind: "confirmed", date: "2026-10-20", arrivalTime: "08:00", from: "A", to: "B" });
    for (const text of [email.text, email.html]) {
      expect(text).not.toContain("final charges");
      expect(text).not.toContain("just call us");
      expect(text).not.toContain("If anything needs to change");
    }
    expect(email.subject).toBe("Your move is booked: Tuesday 20 October 2026, 8:00am");
    expect(email.text).toContain("Your move with us is booked. Here are the details:");
    expect(email.text).toContain("Call us on 03 9494 1070.");
    expect(email.html).toContain("Call us on");
    expect(email.html).toContain("03 9494 1070");
  });
});

describe("it goes out the day before the move (Melbourne time)", () => {
  it("booked on the 18th for the 20th: nothing now, due the 19th, sent by the hourly job at 9am", async () => {
    const { deps, sent } = setup(booking());
    expect(await syncCustomerNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "scheduled", on: "2026-10-19" });
    expect(sent).toHaveLength(0);
    expect(await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => ONE_MIN_BEFORE }, { mode: "cron" })).toEqual({ status: "scheduled", on: "2026-10-19" });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => NINE_AM_19TH }, { mode: "cron" })).toEqual({ status: "sent", kind: "confirmed" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "jane@example.com", kind: "customer" });
    expect(sent[0]!.subject).toContain("Your move is booked: Tuesday 20 October 2026, 8:00am");
    expect(sent[0]!.text).toContain("4/12 Station St, Preston VIC 3072");
    expect(await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => NINE_AM_19TH }, { mode: "cron" })).toEqual({ status: "unchanged" });
    expect(sent).toHaveLength(1);
  });

  it("a move today or tomorrow is sent straight away", async () => {
    for (const date of ["2026-10-19", "2026-10-18"]) {
      const { deps, sent } = setup(booking({ date }));
      expect(await syncCustomerNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "sent", kind: "confirmed" });
      expect(sent).toHaveLength(1);
    }
  });

  it("a new date or time before it goes out is what gets sent", async () => {
    const { deps, sent, change } = setup(booking());
    await syncCustomerNotice({ bookingId: "b-1" }, deps);
    change({ date: "2026-10-25", arrivalTime: "13:00" });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "scheduled", on: "2026-10-24" });
    change({ date: "2026-10-19" });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "sent", kind: "confirmed" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain("Monday 19 October 2026, 1:00pm");
  });

  it("cancelled, unticked or no email before it goes out: nothing is sent", async () => {
    for (const over of [{ status: "cancelled" }, { wanted: false }, { customerEmail: null }]) {
      const { deps, sent } = setup(booking(over));
      expect(await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => NINE_AM_19TH }, { mode: "cron" })).toEqual({ status: "unchanged" });
      expect(sent).toHaveLength(0);
    }
  });

  it("after it has gone out, a change of date, time or address is emailed at once", async () => {
    const { deps, sent, change } = setup(booking());
    await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => NINE_AM_19TH }, { mode: "cron" });
    change({ arrivalTime: "10:30" });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, { ...deps, now: () => new Date("2026-10-18T23:30:00Z") })).toEqual({ status: "sent", kind: "rescheduled" });
    expect(sent[1]!.subject).toContain("Your booking has been updated");
    expect(sent[1]!.text).toContain("10:30am");
    expect(await syncCustomerNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "unchanged" });
  });

  it("an email that fails is retried, not marked as sent; previews only email the test inbox", async () => {
    const failing = setup(booking({ date: "2026-10-19" }), { fail: true });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, failing.deps)).toEqual({ status: "not_notified", why: "email_failed" });
    expect(failing.now().previous).toBeNull();

    const preview = setup(booking({ date: "2026-10-19" }), { nonProduction: true });
    expect(await syncCustomerNotice({ bookingId: "b-1" }, preview.deps)).toEqual({ status: "not_notified", why: "test_inbox_not_set" });
    expect(preview.sent).toHaveLength(0);
    const redirected = setup(booking({ date: "2026-10-19" }), { nonProduction: true, testEmailTo: "tester@example.com" });
    await syncCustomerNotice({ bookingId: "b-1" }, redirected.deps);
    expect(redirected.sent[0]).toMatchObject({ to: "tester@example.com" });
    expect(redirected.sent[0]!.subject.startsWith("[TEST] ")).toBe(true);
  });

  it("tells the team what happened, in one line", () => {
    expect(customerNoticeLine({ status: "scheduled", on: "2026-10-19" })).toBe("Customer email scheduled for Mon 19 Oct (the day before the move).");
    expect(customerNoticeLine({ status: "sent", kind: "confirmed" })).toBe("Customer emailed their booking.");
    expect(customerNoticeLine({ status: "unchanged" })).toBeNull();
  });
});
