import { describe, expect, it } from "vitest";
import { DEPOSIT_AUD, DEPOSIT_MIN_DAYS, depositFor, depositsEnabled, FINAL_PAYMENT_TEXT, PAY_ON_THE_DAY_TEXT } from "./deposit.js";

describe("deposit rule", () => {
  it("is $100, from 7 days before the move", () => {
    expect([DEPOSIT_AUD, DEPOSIT_MIN_DAYS]).toEqual([100, 7]);
    expect(depositFor("2026-10-23", "2026-10-16", null, true)).toMatchObject({ required: true, daysUntilMove: 7, paymentLink: null, finalPayment: FINAL_PAYMENT_TEXT });
    expect(depositFor("2026-10-22", "2026-10-16", null, true)).toMatchObject({ required: false, daysUntilMove: 6, finalPayment: PAY_ON_THE_DAY_TEXT });
    expect(depositFor(null, "2026-10-16", "https://pay", true)).toMatchObject({ required: false, daysUntilMove: null, paymentLink: "https://pay" });
  });

  it("is off unless DEPOSITS_ENABLED is true -- then no move needs one, and nothing is 'remaining'", () => {
    expect(depositsEnabled({})).toBe(false);
    expect(depositsEnabled({ DEPOSITS_ENABLED: "false" })).toBe(false);
    expect(depositsEnabled({ DEPOSITS_ENABLED: "true" })).toBe(true);
    expect(depositFor("2026-11-30", "2026-10-16", "https://pay", false)).toMatchObject({ required: false, finalPayment: PAY_ON_THE_DAY_TEXT });
    expect(PAY_ON_THE_DAY_TEXT).not.toContain("remaining");
  });
});
