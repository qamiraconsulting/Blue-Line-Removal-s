import { describe, expect, it } from "vitest";
import { describeProblem, statusAt, time12, tripProblem, truckDay, type TripLike } from "./truckTrips";

const trip = (over: Partial<TripLike> = {}): TripLike => ({
  id: "t1",
  truckId: "baby-blue",
  date: "2026-10-20",
  arrivalTime: "08:00",
  estimatedMinutes: 180, // 8:00 - 11:00
  status: "confirmed",
  customerName: "Jasmine",
  ...over,
});
const draft = (start: string, end: string, over: Partial<{ id: string; truckId: string; date: string }> = {}) => ({
  truckId: "baby-blue",
  date: "2026-10-20",
  start,
  end,
  ...over,
});

describe("tripProblem -- no double-booking", () => {
  it("refuses the same truck for overlapping times", () => {
    for (const [s, e] of [["09:00", "10:00"], ["07:00", "08:30"], ["10:59", "12:00"], ["07:00", "12:00"]] as const) {
      expect(tripProblem(draft(s, e), [trip()])).toMatchObject({ kind: "clash", with: { id: "t1" } });
    }
  });

  it("allows back-to-back trips, other trucks, other days and cancelled trips", () => {
    expect(tripProblem(draft("11:00", "14:00"), [trip()])).toBeNull();
    expect(tripProblem(draft("06:00", "08:00"), [trip()])).toBeNull();
    expect(tripProblem(draft("09:00", "10:00", { truckId: "big-red" }), [trip()])).toBeNull();
    expect(tripProblem(draft("09:00", "10:00", { date: "2026-10-21" }), [trip()])).toBeNull();
    expect(tripProblem(draft("09:00", "10:00"), [trip({ status: "cancelled" })])).toBeNull();
  });

  it("ignores the trip itself when editing it", () => {
    expect(tripProblem(draft("09:00", "12:00", { id: "t1" }), [trip()])).toBeNull();
    expect(tripProblem(draft("09:00", "12:00", { id: "t1" }), [trip(), trip({ id: "t2", arrivalTime: "11:30", estimatedMinutes: 60 })])).toMatchObject({
      kind: "clash",
      with: { id: "t2" },
    });
  });

  it("refuses an end before the start, and a truck marked off that day", () => {
    expect(tripProblem(draft("11:00", "08:00"), [])).toEqual({ kind: "bad_times" });
    expect(tripProblem(draft("08:00", "08:00"), [])).toEqual({ kind: "bad_times" });
    expect(tripProblem(draft("08:00", "11:00"), [], ["baby-blue"])).toEqual({ kind: "truck_off" });
  });

  it("explains the clash in plain words", () => {
    const p = tripProblem(draft("09:00", "10:00"), [trip()])!;
    expect(describeProblem(p, "Baby Blue")).toBe("Baby Blue is already Assigned / Engaged 8:00 AM - 11:00 AM (Jasmine). Pick another truck or time.");
  });
});

describe("tripProblem -- one driver, one trip at a time", () => {
  const sam = trip({ driverName: "Sam" });
  it("refuses the same driver on two overlapping trips, even on another truck (name match ignores case and spaces)", () => {
    const p = tripProblem({ ...draft("09:00", "10:00", { truckId: "big-red" }), driverName: "  sam " }, [sam]);
    expect(p).toMatchObject({ kind: "driver_clash", with: { id: "t1" } });
    expect(describeProblem(p!, "Big Red")).toBe("Sam is already driving a trip 8:00 AM - 11:00 AM (Jasmine). Pick another driver or time.");
  });

  it("allows the same driver back-to-back, a different driver, or no driver", () => {
    expect(tripProblem({ ...draft("11:00", "13:00", { truckId: "big-red" }), driverName: "Sam" }, [sam])).toBeNull();
    expect(tripProblem({ ...draft("09:00", "10:00", { truckId: "big-red" }), driverName: "Alex" }, [sam])).toBeNull();
    expect(tripProblem({ ...draft("09:00", "10:00", { truckId: "big-red" }), driverName: null }, [sam])).toBeNull();
    expect(tripProblem({ ...draft("09:00", "10:00", { truckId: "big-red" }), driverName: "" }, [trip({ driverName: "" })])).toBeNull();
  });

  it("a truck clash is reported first", () => {
    expect(tripProblem({ ...draft("09:00", "10:00"), driverName: "Sam" }, [sam])).toMatchObject({ kind: "clash" });
  });
});

describe("truckDay -- Assigned / Engaged vs Available", () => {
  it("shows the trip as engaged and the rest of the day as available", () => {
    const segs = truckDay("baby-blue", [trip(), trip({ id: "t2", arrivalTime: "13:00", estimatedMinutes: 120 })], "2026-10-20");
    expect(segs.map((s) => [s.start, s.end, s.engaged])).toEqual([
      ["06:00", "08:00", false],
      ["08:00", "11:00", true],
      ["11:00", "13:00", false],
      ["13:00", "15:00", true],
      ["15:00", "20:00", false],
    ]);
    expect(statusAt(segs, "09:30")).toBe("Assigned / Engaged");
    expect(statusAt(segs, "11:00")).toBe("Available");
    expect(statusAt(segs, "07:59")).toBe("Available");
  });

  it("a truck with no trips is available all day; other trucks' and cancelled trips don't count", () => {
    const segs = truckDay("baby-blue", [trip({ truckId: "big-red" }), trip({ status: "cancelled" })], "2026-10-20");
    expect(segs).toEqual([{ start: "06:00", end: "20:00", engaged: false }]);
  });

  it("stretches the day for an early or late trip", () => {
    const segs = truckDay("baby-blue", [trip({ arrivalTime: "05:00", estimatedMinutes: 60 })], "2026-10-20");
    expect(segs[0]).toMatchObject({ start: "05:00", end: "06:00", engaged: true });
  });
});

it("time12 writes 12-hour times", () => {
  expect([time12("08:00"), time12("11:00"), time12("12:30"), time12("00:15"), time12("17:05")]).toEqual(["8:00 AM", "11:00 AM", "12:30 PM", "12:15 AM", "5:05 PM"]);
});
