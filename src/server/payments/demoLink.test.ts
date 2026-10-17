import { describe, expect, it } from "vitest";
import { demoDepositLink, demoDepositLinkFor } from "./demoLink.js";

describe("the dummy deposit link (until Stripe is connected)", () => {
  it("opens Blue Line's own demo page for the booking", () => {
    expect(demoDepositLink("https://site.example/", "BLR-1")).toBe("https://site.example/deposit?status=demo&ref=BLR-1");
  });

  it("is used in previews and local dev when Stripe is not set up", () => {
    expect(demoDepositLinkFor({ VERCEL_ENV: "preview" }, "https://p.example", false)?.("BLR-1")).toBe("https://p.example/deposit?status=demo&ref=BLR-1");
    expect(demoDepositLinkFor({}, "http://localhost:5173", false)).toBeTypeOf("function");
  });

  it("is never offered on the live site, and never once Stripe is configured", () => {
    expect(demoDepositLinkFor({ VERCEL_ENV: "production" }, "https://www.bluelineremovals.com.au", false)).toBeUndefined();
    expect(demoDepositLinkFor({ VERCEL_ENV: "preview" }, "https://p.example", true)).toBeUndefined();
  });
});
