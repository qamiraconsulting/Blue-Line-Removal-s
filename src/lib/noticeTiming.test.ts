import { describe, expect, it } from "vitest";
import { noticeDate, noticeTiming, shortDay } from "./noticeTiming.js";

describe("when the day-before emails go out (Melbourne dates)", () => {
  it("the day before the move is the send date, across month and year ends", () => {
    expect(noticeDate("2026-10-20")).toBe("2026-10-19");
    expect(noticeDate("2026-11-01")).toBe("2026-10-31");
    expect(noticeDate("2027-01-01")).toBe("2026-12-31");
  });

  it("assigned on the 18th for a move on the 20th: nothing now, due the 19th", () => {
    expect(noticeTiming("2026-10-20", "2026-10-18T10:30", "assign")).toEqual({ due: false, sendOn: "2026-10-19" });
    // the hourly job: not before 9am on the 19th, then yes
    expect(noticeTiming("2026-10-20", "2026-10-18T23:00", "cron").due).toBe(false);
    expect(noticeTiming("2026-10-20", "2026-10-19T00:00", "cron").due).toBe(false);
    expect(noticeTiming("2026-10-20", "2026-10-19T08:59", "cron").due).toBe(false);
    expect(noticeTiming("2026-10-20", "2026-10-19T09:00", "cron").due).toBe(true);
    expect(noticeTiming("2026-10-20", "2026-10-19T17:00", "cron").due).toBe(true);
  });

  it("a move today or tomorrow is sent straight away, whatever the hour", () => {
    expect(noticeTiming("2026-10-19", "2026-10-18T07:00", "assign").due).toBe(true); // tomorrow
    expect(noticeTiming("2026-10-18", "2026-10-18T07:00", "assign").due).toBe(true); // today
    // the hourly job holds anything that is still waiting until 9am
    expect(noticeTiming("2026-10-19", "2026-10-18T07:00", "cron").due).toBe(false);
    expect(noticeTiming("2026-10-19", "2026-10-18T09:00", "cron").due).toBe(true);
  });

  it("a move that has already happened never sends", () => {
    expect(noticeTiming("2026-10-17", "2026-10-18T10:00", "assign").due).toBe(false);
    expect(noticeTiming("2026-10-17", "2026-10-18T10:00", "cron").due).toBe(false);
  });

  it("a later date change moves the send date with it", () => {
    expect(noticeTiming("2026-10-25", "2026-10-18T10:00", "assign").sendOn).toBe("2026-10-24");
    expect(noticeTiming("2026-10-19", "2026-10-18T10:00", "assign")).toEqual({ due: true, sendOn: "2026-10-18" });
  });

  it("writes a short day name", () => {
    expect(shortDay("2026-10-19")).toBe("Mon 19 Oct");
  });
});
