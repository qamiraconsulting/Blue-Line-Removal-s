import { describe, expect, it } from "vitest";
import { checkAvailability, type CapacitySnapshot, type JobRequest } from "./availability.js";

// Wed 14 Oct 2026; "now" is Mon 12 Oct 10:00 in Melbourne.
const settings = {
  autoConfirm: true,
  workingDays: [1, 2, 3, 4, 5, 6],
  arrivalTimes: ["12:00", "07:30"], // deliberately unsorted
  dayEndTime: "18:00",
  bufferMinutes: 30,
  moversPerDay: 6,
  minNoticeHours: 24,
  maxDaysAhead: 60,
  autoConfirmMaxAud: 2000,
};
const snap = (over: Partial<CapacitySnapshot> = {}): CapacitySnapshot => ({
  settings,
  trucks: [
    { id: "t1", truckType: "6-8T", active: true },
    { id: "t2", truckType: "4.5T", active: true },
  ],
  override: null,
  bookings: [],
  nowLocal: "2026-10-12T10:00",
  ...over,
});
const job: JobRequest = { date: "2026-10-14", truckType: "6-8T", movers: 2, estimatedMinutes: 270, amountAud: 720 };

describe("checkAvailability", () => {
  it("offers every set-up arrival time, in order, with the truck that would go", () => {
    const out = checkAvailability(job, snap());
    expect(out).toMatchObject({ dayOpen: true, instantConfirm: true, instantConfirmBlockedBy: [] });
    expect(out.slots).toEqual([
      { time: "07:30", available: true, truckId: "t1" },
      { time: "12:00", available: true, truckId: "t1" },
    ]);
  });

  it("a booked truck blocks overlapping times only (job + buffer)", () => {
    // 07:30 + 4.5h + 30min buffer = 12:30, so the 12:00 slot overlaps; 07:30 is taken
    // (only the 6-8T truck here, so there's nothing to stand in)
    const booked = snap({
      trucks: [{ id: "t1", truckType: "6-8T", active: true }],
      bookings: [{ arrivalTime: "07:30", estimatedMinutes: 270, truckType: "6-8T", truckId: "t1", movers: 2 }],
    });
    expect(checkAvailability(job, booked).slots.map((s) => [s.time, s.available, s.reason])).toEqual([
      ["07:30", false, "no_truck"],
      ["12:00", false, "no_truck"],
    ]);
    // a short morning job leaves the afternoon free
    const short = snap({ bookings: [{ arrivalTime: "07:30", estimatedMinutes: 120, truckType: "6-8T", truckId: "t1", movers: 2 }] });
    expect(checkAvailability(job, short).slots.find((s) => s.time === "12:00")).toMatchObject({ available: true });
  });

  it("a phone booking with no truck assigned still uses up a truck of its size", () => {
    const out = checkAvailability(
      job,
      snap({ trucks: [{ id: "t1", truckType: "6-8T", active: true }], bookings: [{ arrivalTime: "07:30", estimatedMinutes: 600, truckType: "6-8T", truckId: null, movers: 2 }] }),
    );
    expect(out.slots.every((s) => !s.available && s.reason === "no_truck")).toBe(true);
  });

  it("when the right size is busy, a smaller free truck stands in (more trips) -- offered, for the team to confirm", () => {
    const busy = snap({ bookings: [{ arrivalTime: "07:30", estimatedMinutes: 600, truckType: "6-8T", truckId: "t1", movers: 2 }] });
    expect(checkAvailability(job, busy).slots[0]).toEqual({ time: "07:30", available: true, truckId: "t2", substituteTruckType: "4.5T" });
  });

  it("a smaller truck is preferred as the stand-in, then a bigger one", () => {
    const fleet = [
      { id: "small", truckType: "4.5T", active: true },
      { id: "mid", truckType: "6-8T", active: true },
      { id: "big", truckType: "10T", active: true },
    ];
    const midBusy = [{ arrivalTime: "07:30", estimatedMinutes: 600, truckType: "6-8T", truckId: "mid", movers: 2 }];
    expect(checkAvailability(job, snap({ trucks: fleet, bookings: midBusy })).slots[0]).toMatchObject({ truckId: "small", substituteTruckType: "4.5T" });
    const midAndSmallBusy = [...midBusy, { arrivalTime: "07:30", estimatedMinutes: 600, truckType: "4.5T", truckId: "small", movers: 2 }];
    expect(checkAvailability(job, snap({ trucks: fleet, bookings: midAndSmallBusy, settings: { ...settings, moversPerDay: 10 } })).slots[0]).toMatchObject({
      truckId: "big",
      substituteTruckType: "10T",
    });
  });

  it("another size's booking doesn't block the truck, but its movers count", () => {
    const other = snap({ bookings: [{ arrivalTime: "07:30", estimatedMinutes: 600, truckType: "4.5T", truckId: "t2", movers: 5 }] });
    // 5 movers busy + 2 needed > 6 available
    expect(checkAvailability(job, other).slots[0]).toMatchObject({ available: false, reason: "no_movers" });
    expect(checkAvailability({ ...job, movers: 1 }, other).slots[0]).toMatchObject({ available: true });
  });

  it("a job that would run past the end of the day isn't offered", () => {
    const long = checkAvailability({ ...job, estimatedMinutes: 6 * 60 }, snap());
    expect(long.slots.find((s) => s.time === "12:00")).toMatchObject({ available: false, reason: "outside_working_hours" });
  });

  it("respects minimum notice", () => {
    const tomorrow = checkAvailability({ ...job, date: "2026-10-13" }, snap());
    expect(tomorrow.slots.map((s) => s.reason)).toEqual(["too_soon", undefined]); // 07:30 is < 24h away, 12:00 is > 24h
  });

  it("closed days, non-working days, past days and dates too far ahead offer nothing", () => {
    expect(checkAvailability(job, snap({ override: { closed: true, moversAvailable: null, trucksUnavailable: [] } }))).toMatchObject({ dayOpen: false, dayReason: "closed" });
    expect(checkAvailability({ ...job, date: "2026-10-18" }, snap())).toMatchObject({ dayOpen: false, dayReason: "not_a_working_day" }); // Sunday
    expect(checkAvailability({ ...job, date: "2026-10-01" }, snap())).toMatchObject({ dayOpen: false, dayReason: "in_the_past" });
    expect(checkAvailability({ ...job, date: "2027-01-30" }, snap())).toMatchObject({ dayOpen: false, dayReason: "too_far_ahead" });
  });

  it("a truck taken off for the day, or fewer movers that day, reduces capacity", () => {
    const off = snap({ override: { closed: false, moversAvailable: null, trucksUnavailable: ["t1", "t2"] } });
    expect(checkAvailability(job, off).slots.every((s) => s.reason === "no_truck")).toBe(true);
    const fewMovers = snap({ override: { closed: false, moversAvailable: 1, trucksUnavailable: [] } });
    expect(checkAvailability(job, fewMovers).slots.every((s) => s.reason === "no_movers")).toBe(true);
  });

  it("nothing is offered until the team has set up arrival times, working days, end of day and movers", () => {
    expect(checkAvailability(job, snap({ settings: { ...settings, arrivalTimes: [] } }))).toMatchObject({ dayOpen: false, dayReason: "not_set_up" });
    expect(checkAvailability(job, snap({ settings: { ...settings, moversPerDay: null } }))).toMatchObject({ dayOpen: false, dayReason: "not_set_up" });
  });

  it("instant confirmation needs the switch on, every rule set, and the estimate under the limit", () => {
    expect(checkAvailability(job, snap({ settings: { ...settings, autoConfirm: false } }))).toMatchObject({ instantConfirm: false, instantConfirmBlockedBy: ["auto_confirm_off"] });
    expect(checkAvailability(job, snap({ settings: { ...settings, minNoticeHours: null } })).instantConfirmBlockedBy).toContain("min_notice_not_set");
    expect(checkAvailability({ ...job, amountAud: 2500 }, snap()).instantConfirmBlockedBy).toContain("over_auto_confirm_limit");
    expect(checkAvailability(job, snap({ settings: { ...settings, autoConfirmMaxAud: null } })).instantConfirm).toBe(true);
  });
});

describe("truck trips (Bookings & capacity > Truck trips) as the chat sees them", () => {
  // Two 6-8T trucks: "Baby Blue" (bb) and "Big Red" (br). A trip is a calendar booking with a named truck.
  const two = (bookings: CapacitySnapshot["bookings"]) =>
    snap({
      trucks: [
        { id: "bb", truckType: "6-8T", active: true },
        { id: "br", truckType: "6-8T", active: true },
      ],
      bookings,
    });
  const tripOn = (truckId: string, arrivalTime: string, estimatedMinutes: number) => ({ arrivalTime, estimatedMinutes, truckType: "6-8T", truckId, movers: 2 });

  it("a trip on one truck sends the chat's job to the other truck", () => {
    const out = checkAvailability(job, two([tripOn("bb", "08:00", 180)]));
    expect(out.slots.find((s) => s.time === "07:30")).toEqual({ time: "07:30", available: true, truckId: "br" });
  });

  it("with both trucks on trips, the chat doesn't offer that time", () => {
    const out = checkAvailability(job, two([tripOn("bb", "08:00", 180), tripOn("br", "07:00", 240)]));
    expect(out.slots.find((s) => s.time === "07:30")).toMatchObject({ available: false, reason: "no_truck" });
  });

  it("once a trip is cancelled (no longer in the calendar), the time is offered again", () => {
    // loadCapacity only reads confirmed bookings, so a cancelled trip simply isn't in the snapshot
    const out = checkAvailability(job, two([tripOn("br", "07:00", 240)]));
    expect(out.slots.find((s) => s.time === "07:30")).toEqual({ time: "07:30", available: true, truckId: "bb" });
  });
});
