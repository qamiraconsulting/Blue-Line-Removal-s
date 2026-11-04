import { describe, expect, it } from "vitest";
import { calculateQuote, type QuoteInputs } from "./calculateQuote.js";
import { priceFormJob, quickEstimate } from "./calculator.js";
import { blrRateCard } from "./rateCard.js";
import { quoteValues } from "../jobs/pdfQuote.js";

const job: QuoteInputs = {
  need: "moving",
  propertySize: "2_bed",
  truck: "4.5T",
  movers: 2,
  movingDate: "2026-11-20",
  firstMoveRequested: true,
  firstMoveEligible: true,
  access: { pickupStairFlights: 1, dropoffStairFlights: 2, pickupLongCarry: true, dropoffLongCarry: false, heavyItems: 1 },
  specialItems: false,
  depotToPickup: { km: 15, minutes: 25 },
  pickupToDropoff: { km: 20, minutes: 30 },
};

describe("priceFormJob (Matt's Google Form, priced by the Quick estimate)", () => {
  it("prices exactly like the chat's engine for the same job", () => {
    for (const newCustomer of [true, false]) {
      const engine = calculateQuote({ ...job, firstMoveEligible: newCustomer }, blrRateCard);
      if (engine.kind !== "price") throw new Error("expected a price");
      // 2 bed = 3 h on the guide + 30 min drive
      const form = priceFormJob({ truck: "4.5T", movers: 2, hours: 3.5, stairFlights: 3, longCarryEnds: 1, heavyItems: 1, newCustomer }, blrRateCard);
      expect(form?.total).toBe(engine.amountAud);
    }
  });

  it("puts the 10% in once, as one line, and leaves $0 lines out", () => {
    const form = priceFormJob({ truck: "4.5T", movers: 2, hours: 3.5, stairFlights: 3, longCarryEnds: 1, heavyItems: 1, newCustomer: true }, blrRateCard)!;
    const v = quoteValues(form.lines);
    const discountRows = v.ExtraRows.filter((r) => r.label.startsWith("New customer discount"));
    expect(discountRows).toHaveLength(1);
    expect(v.ExtraRows.map((r) => r.label)).toEqual(["Long Carry Fee", "Heavy Items", "New customer discount (10%)"]);
    expect(v.Adjustment).toBe("0.00");
    expect(v.Stair).toBe("120.00");
    // Subtotal + GST is the total, rounded to $10
    expect(Number(v.Subtotal) + Number(v.GST)).toBeCloseTo(Number(v.Total), 2);
    expect(Number(v.Total) % 10).toBe(0);
  });

  it("has no discount line for a returning customer, and no lines for extras not there", () => {
    const form = priceFormJob({ truck: "6-8T", movers: 2, hours: 5.25, stairFlights: 0, longCarryEnds: 0, heavyItems: 0, newCustomer: false }, blrRateCard)!;
    expect(quoteValues(form.lines).ExtraRows).toEqual([]);
    expect(form.lines.rateHr).toBe(140);
  });

  it("uses the form's own rate when it has one", () => {
    const form = priceFormJob({ truck: "4.5T", movers: 2, hours: 2, rateHr: 150, stairFlights: 0, longCarryEnds: 0, heavyItems: 0, newCustomer: false }, blrRateCard)!;
    expect(form.total).toBe(330); // 2 h x $150 = $300 + GST = $330
  });
});

describe("quickEstimate", () => {
  it("refuses a crew the truck doesn't take", async () => {
    const out = await quickEstimate(
      {
        from: "1 Test St, Preston VIC 3072",
        to: "2 Test Rd, Coburg VIC 3058",
        propertySize: "2_bed",
        truck: "10T",
        movers: 2,
        movingDate: "2026-11-20",
        pickupApartment: false,
        pickupStairFlights: 0,
        pickupParkingOver50m: false,
        dropoffApartment: false,
        dropoffStairFlights: 0,
        dropoffParkingOver50m: false,
        heavyItems: 0,
        newCustomer: true,
      },
      { rateCard: blrRateCard, routes: { apiKey: "unused" } },
    );
    expect(out).toEqual({ ok: false, reason: "crew_not_allowed" });
  });
});
