import { describe, expect, it } from "vitest";
import { customerKeys, type PreviousMoveQuery } from "../customers/previousMove.js";
import { checkCustomer, customerCheckSchema } from "./customerCheck.js";

const request = (over: Record<string, unknown> = {}) =>
  customerCheckSchema.parse({ action: "customerCheck", email: "Jane@Example.com", phone: "0412 345 678", bookingNo: "BLR25102601", moveDateIso: "2026-11-02", ...over });

describe("customer check for Matt's Google Form (10% first-booking offer)", () => {
  it("no earlier booked/completed job = new customer, with the rate card's 10%", async () => {
    const r = await checkCustomer(request(), async () => null);
    expect(r).toEqual({ ok: true, customerType: "new", previousMove: null, discountPercent: 10 });
  });

  it("an earlier move = returning customer, and says which one", async () => {
    const prev = { reference: "BLR16102614", movingDate: "2026-10-19", status: "completed" };
    const r = await checkCustomer(request(), async () => prev);
    expect(r).toMatchObject({ customerType: "returning", previousMove: prev });
  });

  it("leaves out the job being quoted now (its booking number, website reference and move date)", async () => {
    let seen: PreviousMoveQuery | null = null;
    await checkCustomer(request({ linkedReference: "BLR-20261025-AB12CD" }), async (q) => ((seen = q), null));
    expect(seen).toEqual({
      email: "Jane@Example.com",
      phone: "0412 345 678",
      excludeReferences: ["BLR25102601", "BLR-20261025-AB12CD"],
      sameJobDate: "2026-11-02",
    });
  });

  it("ignores a move date that isn't yyyy-mm-dd", async () => {
    let seen: PreviousMoveQuery | null = null;
    await checkCustomer(request({ moveDateIso: "" }), async (q) => ((seen = q), null));
    expect(seen!.sameJobDate).toBe(null);
  });

  it("matches email without capitals and phone in one format; blanks match nothing", () => {
    expect(customerKeys(" Jane@Example.COM ", "+61 412 345 678")).toEqual({ email: "jane@example.com", phone: "0412345678" });
    expect(customerKeys("jane@example.com", "412345678")).toEqual({ email: "jane@example.com", phone: "0412345678" });
    expect(customerKeys("", "")).toEqual({ email: null, phone: null });
    expect(customerKeys("not an email", "12")).toEqual({ email: null, phone: null });
  });
});
