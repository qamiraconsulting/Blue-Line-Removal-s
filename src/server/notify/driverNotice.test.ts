import { describe, expect, it } from "vitest";
import { resolveDriver, type DriverLike } from "../../lib/drivers.js";
import type { DriverNoticeSnapshot } from "../db/schema.js";
import type { OutgoingEmail } from "../quote/service.js";
import { noticeChanges, syncDriverNotice, type DriverNoticeStore, type TripForNotice } from "./driverNotice.js";

const SAM: DriverLike = { id: "d-sam", name: "Sam Patel", phone: "0400 111 222", email: "sam@example.com", active: true };
const PAT: DriverLike = { id: "d-pat", name: "Pat Lee", phone: null, email: "pat@example.com", active: true };
const NOW = new Date("2026-10-16T02:00:00Z");

const TRUCKS = [{ id: "t-baby", driverId: SAM.id }, { id: "t-big", driverId: null }];

function trip(over: Partial<TripForNotice> = {}): TripForNotice {
  return {
    id: "b-1",
    status: "confirmed",
    quoteReference: "BLR-20261016-ABC123",
    date: "2026-10-19",
    arrivalTime: "08:00",
    estimatedMinutes: 180,
    movers: 2,
    truckLabel: "Baby Blue",
    customerName: "Jane Smith",
    phone: "0412 345 678",
    customerEmail: "jane@example.com",
    fromText: "12 Station St, Preston",
    toText: "5 High St, Brunswick",
    notes: "Gate code 1234",
    driver: resolveDriver({ truckId: "t-baby" }, TRUCKS, [SAM, PAT]),
    testMode: false,
    previous: null,
    ...over,
  };
}

function setup(first: TripForNotice, opts: { fail?: boolean; nonProduction?: boolean; testEmailTo?: string } = {}) {
  let current = first;
  const sent: OutgoingEmail[] = [];
  const store: DriverNoticeStore = {
    find: async () => current,
    save: async (_id, snapshot) => {
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
  return { deps, sent, change: (over: Partial<TripForNotice>) => (current = { ...current, ...over }), now: () => current };
}

describe("who drives a trip", () => {
  it("is the truck's usual driver unless someone covers that trip", () => {
    expect(resolveDriver({ truckId: "t-baby" }, TRUCKS, [SAM, PAT])).toMatchObject({ name: "Sam Patel", isCover: false });
    expect(resolveDriver({ truckId: "t-baby", driverId: PAT.id }, TRUCKS, [SAM, PAT])).toMatchObject({ name: "Pat Lee", isCover: true });
    expect(resolveDriver({ truckId: "t-big" }, TRUCKS, [SAM, PAT])).toBeNull();
    // an older typed name has no record, so nobody to email
    expect(resolveDriver({ truckId: "t-big", driverName: "Sam" }, TRUCKS, [SAM, PAT])).toMatchObject({ driver: null, name: "Sam" });
  });
});

describe("telling the driver about a job", () => {
  it("emails the usual driver the date, time, pick-up, drop-off and the customer's details -- and no price", async () => {
    const { deps, sent, now } = setup(trip());
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "sent", kind: "new", to: "sam@example.com" });
    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email).toMatchObject({ to: "sam@example.com", kind: "driver" });
    expect(email.subject).toContain("New job");
    for (const text of ["Monday 19 October 2026", "8:00am", "about 11:00am", "Baby Blue", "12 Station St, Preston", "5 High St, Brunswick", "Jane Smith", "0412 345 678", "jane@example.com", "Gate code 1234"]) {
      expect(email.text).toContain(text);
    }
    expect(email.text).not.toMatch(/\$|price|estimate/i);
    expect(now().previous).toMatchObject({ driverId: "d-sam", driverEmail: "sam@example.com" });
  });

  it("does not email twice for the same job", async () => {
    const { deps, sent } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "unchanged" });
    expect(sent).toHaveLength(1);
  });

  it("sends an update, listing what changed, when the time or address moves", async () => {
    const { deps, sent, change } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ arrivalTime: "10:30", toText: "9 Park Rd, Coburg" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toMatchObject({ status: "sent", kind: "update", to: "sam@example.com" });
    const update = sent[1]!;
    expect(update.subject).toContain("Job updated");
    expect(update.text).toContain("Arrive at: 10:30am (was 8:00am)");
    expect(update.text).toContain("Drop-off: 9 Park Rd, Coburg (was 5 High St, Brunswick)");
    expect(update.text).not.toContain("Customer: Jane Smith (was");
  });

  it("when someone else covers, the new driver gets the job and the usual driver is told they're off it", async () => {
    const { deps, sent, change, now } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ driver: resolveDriver({ truckId: "t-baby", driverId: PAT.id }, TRUCKS, [SAM, PAT]) });
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    expect(sent.map((e) => [e.to, e.subject.split(":")[0]])).toEqual([
      ["sam@example.com", "New job"],
      ["sam@example.com", "Job reassigned"],
      ["pat@example.com", "New job"],
    ]);
    expect(now().previous?.driverId).toBe("d-pat");
  });

  it("tells the driver when the booking is cancelled, and then stays quiet", async () => {
    const { deps, sent, change, now } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ status: "cancelled" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toMatchObject({ status: "sent", kind: "cancelled", to: "sam@example.com" });
    expect(sent[1]!.subject).toContain("Job cancelled");
    expect(now().previous).toBeNull();
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "unchanged" });
    expect(sent).toHaveLength(2);
  });

  it("says why nobody was told, so the team can fix it", async () => {
    expect(await syncDriverNotice({ bookingId: "b-1" }, setup(trip({ truckLabel: null, driver: null })).deps)).toMatchObject({ status: "not_notified", why: "no_truck" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, setup(trip({ driver: null })).deps)).toMatchObject({ status: "not_notified", why: "no_driver" });
    const noEmail = resolveDriver({ truckId: "t-baby" }, TRUCKS, [{ ...SAM, email: null }]);
    expect(await syncDriverNotice({ bookingId: "b-1" }, setup(trip({ driver: noEmail })).deps)).toMatchObject({ status: "not_notified", why: "driver_has_no_email" });
    const inactive = resolveDriver({ truckId: "t-baby" }, TRUCKS, [{ ...SAM, active: false }]);
    expect(await syncDriverNotice({ bookingId: "b-1" }, setup(trip({ driver: inactive })).deps)).toMatchObject({ status: "not_notified", why: "driver_inactive" });
  });

  it("an email that fails is retried next time, not marked as sent", async () => {
    const failing = setup(trip(), { fail: true });
    expect(await syncDriverNotice({ bookingId: "b-1" }, failing.deps)).toMatchObject({ status: "not_notified", why: "email_failed" });
    expect(failing.now().previous).toBeNull();
  });

  it("test bookings and previews never email a real driver", async () => {
    const test = setup(trip({ testMode: true }));
    expect(await syncDriverNotice({ bookingId: "b-1" }, test.deps)).toMatchObject({ status: "not_notified", why: "test_mode" });
    expect(test.sent).toHaveLength(0);

    const preview = setup(trip(), { nonProduction: true, testEmailTo: "tester@example.com" });
    await syncDriverNotice({ bookingId: "b-1" }, preview.deps);
    expect(preview.sent[0]).toMatchObject({ to: "tester@example.com" });
    expect(preview.sent[0]!.subject.startsWith("[TEST] ")).toBe(true);
  });

  it("escapes the customer's text in the HTML email", async () => {
    const { deps, sent } = setup(trip({ notes: "<script>alert(1)</script>" }));
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    expect(sent[0]!.html).not.toContain("<script>");
    expect(sent[0]!.html).toContain("&lt;script&gt;");
  });
});

describe("what counts as a change", () => {
  const base: DriverNoticeSnapshot = {
    driverId: "d-sam",
    driverName: "Sam Patel",
    driverEmail: "sam@example.com",
    date: "2026-10-19",
    arrivalTime: "08:00",
    estimatedMinutes: 180,
    truckLabel: "Baby Blue",
    customerName: "Jane",
    phone: null,
    customerEmail: null,
    fromText: "A",
    toText: "B",
    notes: null,
    sentAt: "2026-10-16T00:00:00.000Z",
  };
  it("ignores when it was sent; reports date, time, length, addresses, customer and truck", () => {
    expect(noticeChanges(base, { ...base, sentAt: "later" })).toEqual([]);
    expect(noticeChanges(base, { ...base, date: "2026-10-20", estimatedMinutes: 240, truckLabel: "Big Blue" }).map((c) => c.label)).toEqual(["Date", "Expected finish", "Truck"]);
  });
});
