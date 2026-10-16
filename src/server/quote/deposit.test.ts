import { describe, expect, it } from "vitest";
import { DEPOSIT_AUD, DEPOSIT_MIN_DAYS, depositFor } from "./deposit.js";

describe("deposit rule", () => {
  it("is $100, from 7 days before the move", () => {
    expect([DEPOSIT_AUD, DEPOSIT_MIN_DAYS]).toEqual([100, 7]);
    expect(depositFor("2026-10-23", "2026-10-16", null)).toMatchObject({ required: true, daysUntilMove: 7, paymentLink: null });
    expect(depositFor("2026-10-22", "2026-10-16", null)).toMatchObject({ required: false, daysUntilMove: 6 });
    expect(depositFor(null, "2026-10-16", "https://pay")).toMatchObject({ required: false, daysUntilMove: null, paymentLink: "https://pay" });
  });
});
