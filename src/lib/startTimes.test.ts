import { describe, expect, it } from "vitest";
import { nearestTimes, startTimesBetween, startTimesSummary } from "./startTimes.js";

describe("arrival times as 'every N minutes from first to last'", () => {
  it("makes the list the chat books from", () => {
    expect(startTimesBetween("07:00", "09:00", 30)).toEqual(["07:00", "07:30", "08:00", "08:30", "09:00"]);
    expect(startTimesBetween("00:00", "23:30", 30)).toHaveLength(48); // around the clock
    expect(startTimesBetween("06:00", "18:00", 60)).toHaveLength(13);
  });

  it("gives nothing for boxes that don't make sense", () => {
    expect(startTimesBetween("", "09:00", 30)).toEqual([]);
    expect(startTimesBetween("10:00", "09:00", 30)).toEqual([]);
    expect(startTimesBetween("07:00", "09:00", 0)).toEqual([]);
    expect(startTimesBetween("07:00", "24:00", 30)).toEqual([]);
  });

  it("reads the three boxes back from a saved list", () => {
    expect(startTimesSummary(["07:30", "08:00", "08:30"])).toEqual({ first: "07:30", last: "08:30", everyMinutes: 30 });
    expect(startTimesSummary([])).toEqual({ first: "", last: "", everyMinutes: 30 });
  });

  it("offers the free times nearest to the one asked for", () => {
    const free = startTimesBetween("06:00", "18:00", 30).filter((t) => t !== "09:00");
    expect(nearestTimes(free, "09:00")).toEqual(["08:00", "08:30", "09:30"]); // a tie goes to the earlier time
    expect(nearestTimes(free, "05:00")).toEqual(["06:00", "06:30", "07:00"]);
    expect(nearestTimes(["07:30"], "09:00")).toEqual(["07:30"]);
    // nothing asked for: earliest, middle, latest
    expect(nearestTimes(free, null)).toEqual(["06:00", "12:30", "18:00"]);
  });
});
