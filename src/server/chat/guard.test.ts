import { describe, expect, it } from "vitest";
import { BLOCKED_REPLY, guardReply } from "./guard.js";

describe("guardReply", () => {
  it("lets through a price the engine actually quoted, in any normal format", () => {
    expect(guardReply("Your flat price is $850 all up.", [850])).toEqual({ ok: true, text: "Your flat price is $850 all up." });
    expect(guardReply("That's $1,430 including GST.", [1430]).ok).toBe(true);
    expect(guardReply("$ 850.00 total", [850]).ok).toBe(true);
  });

  it("lets through replies with no dollar figure (percentages and phone numbers are fine)", () => {
    expect(guardReply("First-time customers get 30% off! Call 03 9494 1070.", []).ok).toBe(true);
  });

  it("blocks any figure the engine didn't produce", () => {
    expect(guardReply("It'll be around $700.", [850])).toEqual({ ok: false, text: BLOCKED_REPLY, reason: "unquoted_amount" });
    expect(guardReply("Usually $600-$900 for a 2 bed.", []).ok).toBe(false);
    expect(guardReply("$850 for the move, $595 after the discount.", [850]).ok).toBe(false);
    expect(guardReply("That works out at $849.50.", [850]).ok).toBe(false);
  });

  it("blocks hourly-rate and call-out talk even with no dollar sign", () => {
    for (const text of [
      "We charge 120 per hour.",
      "That's 140/hr for two movers.",
      "Our hourly rate depends on the truck.",
      "There's a small call-out fee.",
      "No callout charge for you!",
      "There's a minimum of 2 hours.",
    ]) {
      expect(guardReply(text, [850])).toMatchObject({ ok: false, reason: "rate_talk" });
    }
  });

  it("the replacement reply itself passes the guard", () => {
    expect(guardReply(BLOCKED_REPLY, []).ok).toBe(true);
  });
});
