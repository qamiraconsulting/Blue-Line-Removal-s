import { describe, expect, it } from "vitest";
import { resolveDriver, type DriverLike } from "../../lib/drivers.js";
import type { DriverNoticeSnapshot } from "../db/schema.js";
import type { OutgoingEmail } from "../quote/service.js";
import { driverNoticeLine, syncDriverNotice, type DriverNoticeStore, type TripForNotice } from "./driverNotice.js";

// The driver's first email waits for the day before the move, Melbourne time (Ayesha, 2026-10-18).

const SAM: DriverLike = { id: "d-sam", name: "Sam Patel", phone: null, email: "sam@example.com", active: true };
const PAT: DriverLike = { id: "d-pat", name: "Pat Lee", phone: null, email: "pat@example.com", active: true };
const TRUCKS = [{ id: "t-baby", driverId: SAM.id }];

// Sun 18 Oct, 1pm in Melbourne. A move on Tue 20 Oct is due on Mon 19 Oct; the hourly job sends it from 9am.
const NOW = new Date("2026-10-18T02:00:00Z");
const NINE_AM_19TH = "2026-10-18T22:00:00Z"; // Mon 19 Oct 09:00 AEDT (UTC+11)
const ONE_MIN_BEFORE = "2026-10-18T21:59:00Z";
const at = (iso: string) => ({ now: () => new Date(iso) });

const trip = (over: Partial<TripForNotice> = {}): TripForNotice => ({
  id: "b-1",
  status: "confirmed",
  quoteReference: null,
  date: "2026-10-20",
  arrivalTime: "08:00",
  estimatedMinutes: 180,
  movers: 2,
  truckLabel: "Baby Blue",
  customerName: "Jane Smith",
  phone: "0412 345 678",
  customerEmail: "jane@example.com",
  fromText: "4/12 Station St, Preston VIC 3072",
  toText: "5 High St, Brunswick VIC 3056",
  notes: null,
  driver: resolveDriver({ truckId: "t-baby" }, TRUCKS, [SAM, PAT]),
  testMode: false,
  previous: null,
  ...over,
});

function setup(first: TripForNotice) {
  let current = first;
  const sent: OutgoingEmail[] = [];
  const store: DriverNoticeStore = {
    find: async () => current,
    save: async (_id, snapshot: DriverNoticeSnapshot | null) => {
      current = { ...current, previous: snapshot };
    },
  };
  const deps = { store, sendEmail: async (e: OutgoingEmail) => (sent.push(e), true), replyTo: "hello@example.com", now: () => NOW };
  return { deps, sent, change: (over: Partial<TripForNotice>) => (current = { ...current, ...over }), now: () => current };
}

describe("the driver's first email waits for the day before the move", () => {
  it("assigned on the 18th for a move on the 20th: nothing now, scheduled for the 19th, sent by the hourly job at 9am", async () => {
    const { deps, sent, now } = setup(trip());
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "scheduled", on: "2026-10-19" });
    expect(sent).toHaveLength(0);
    expect(now().previous).toBeNull();

    expect(await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at(ONE_MIN_BEFORE) }, { mode: "cron" })).toEqual({ status: "scheduled", on: "2026-10-19" });
    expect(sent).toHaveLength(0);
    expect(await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at(NINE_AM_19TH) }, { mode: "cron" })).toMatchObject({ status: "sent", kind: "new" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain("New job");
    // and it is not sent again on the next hour
    expect(await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at("2026-10-18T23:00:00Z") }, { mode: "cron" })).toEqual({ status: "unchanged" });
  });

  it("a move today or tomorrow is sent straight away", async () => {
    const tomorrow = setup(trip({ date: "2026-10-19" }));
    expect(await syncDriverNotice({ bookingId: "b-1" }, tomorrow.deps)).toMatchObject({ status: "sent", kind: "new" });
    const today = setup(trip({ date: "2026-10-18" }));
    expect(await syncDriverNotice({ bookingId: "b-1" }, today.deps)).toMatchObject({ status: "sent", kind: "new" });
  });

  it("a new date before it goes out moves the send date; bringing it forward to tomorrow sends at once", async () => {
    const { deps, sent, change } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ date: "2026-10-25" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "scheduled", on: "2026-10-24" });
    change({ date: "2026-10-19" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toMatchObject({ status: "sent", kind: "new" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Monday 19 October 2026");
  });

  it("a different driver before it goes out gets the job; the first driver is never emailed", async () => {
    const { deps, sent, change } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ driver: resolveDriver({ truckId: "t-baby", driverId: PAT.id }, TRUCKS, [SAM, PAT]) });
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at(NINE_AM_19TH) }, { mode: "cron" });
    expect(sent.map((e) => e.to)).toEqual(["pat@example.com"]);
  });

  it("cancelled before it goes out: nothing is ever sent", async () => {
    const { deps, sent, change } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, deps);
    change({ status: "cancelled" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, deps)).toEqual({ status: "unchanged" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at(NINE_AM_19TH) }, { mode: "cron" })).toEqual({ status: "unchanged" });
    expect(sent).toHaveLength(0);
  });

  it("once the driver has been told, a change is emailed at once -- not held for a day", async () => {
    const { deps, sent, change } = setup(trip());
    await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at(NINE_AM_19TH) }, { mode: "cron" });
    change({ arrivalTime: "10:30" });
    expect(await syncDriverNotice({ bookingId: "b-1" }, { ...deps, ...at("2026-10-18T23:30:00Z") })).toMatchObject({ status: "sent", kind: "update" });
    expect(sent.map((e) => e.subject.split(":")[0])).toEqual(["New job", "Job updated"]);
  });

  it("tells the team when it is scheduled", () => {
    expect(driverNoticeLine({ status: "scheduled", on: "2026-10-19" })).toBe("Driver email scheduled for Mon 19 Oct (the day before the move).");
  });
});
