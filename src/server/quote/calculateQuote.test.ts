import { describe, expect, it } from "vitest";
import { calculateQuote, type QuoteInputs } from "./calculateQuote.js";
import { blrRateCard, getActiveRateCard, type RateCard } from "./rateCard.js";
import { fixtureRateCard } from "./rateCard.fixture.js";

// Hand-checkable made-up card (see rateCard.fixture.ts), independent of Blue Line's real prices.
const card: RateCard = fixtureRateCard;

const WEEKDAY = "2026-10-14"; // Wednesday
const SATURDAY = "2026-10-17";
const HOLIDAY = "2026-11-03"; // listed public holiday, a Tuesday

const base: QuoteInputs = {
  need: "moving",
  truck: "6.0T", // $145/hr incl. 2 movers, 4h loading+unloading with 2 movers
  movers: 2,
  movingDate: WEEKDAY,
  firstMoveRequested: false,
  firstMoveEligible: true,
  access: { pickupStairFlights: 0, dropoffStairFlights: 0, longCarry: false, heavyItems: 0 },
  specialItems: false,
  depotToPickup: { km: 15, minutes: 25 },
  pickupToDropoff: { km: 20, minutes: 30 },
};

const price = (inputs: Partial<QuoteInputs> = {}, c: RateCard = card) => {
  const out = calculateQuote({ ...base, ...inputs }, c);
  if (out.kind !== "price") throw new Error(`expected a price, got manual: ${out.reason}`);
  return out;
};
const manual = (inputs: Partial<QuoteInputs> = {}, c: RateCard = card, allow = false) => {
  const out = calculateQuote({ ...base, ...inputs }, c, { allowPlaceholderRateCard: allow });
  if (out.kind !== "manual") throw new Error(`expected manual, got price $${out.amountAud}`);
  return out.reason;
};

describe("flat price arithmetic (hand-checked)", () => {
  it("6t truck, 2 movers, weekday: (4h + 30min drive) x $145 + $60 call-out, +10% GST, rounded", () => {
    // 4.5h x 145 = 652.5; call-out 1h x 60 = 60; subtotal 712.5; GST 71.25; 783.75 -> $780
    const out = price();
    expect(out.amountAud).toBe(780);
    expect(out.internal).toMatchObject({ jobHours: 4.5, labourCostAud: 652.5, callOutCostAud: 60, subtotalAud: 712.5, gstAud: 71.25 });
  });

  it("rates that already include GST are not taxed twice", () => {
    // 712.5 already includes GST -> $710
    expect(price({}, { ...card, gst: { ratesIncludeGst: true, ratePercent: 10 } }).amountAud).toBe(710);
  });

  it("first-move offer takes 30% off the charges excluding GST; GST is 10% of the discounted price", () => {
    // 712.5 - 30% (213.75) = 498.75; GST 49.875; 548.625 -> $550
    const out = price({ firstMoveRequested: true, firstMoveEligible: true });
    expect(out.amountAud).toBe(550);
    expect(out.customer.firstMoveApplied).toBe(true);
    expect(out.internal).toMatchObject({ subtotalAud: 712.5, discountAud: 213.75, gstAud: 49.88 });
  });

  it("first-move offer is NOT applied when the customer isn't eligible", () => {
    const out = price({ firstMoveRequested: true, firstMoveEligible: false });
    expect(out.amountAud).toBe(780);
    expect(out.customer.firstMoveApplied).toBe(false);
  });

  it("weekends carry the weekend surcharge", () => {
    // 712.5 x 1.2 = 855; x1.1 = 940.5 -> $940
    expect(price({ movingDate: SATURDAY }).amountAud).toBe(940);
  });

  it("no weekend surcharge when the card says 0%", () => {
    expect(price({ movingDate: SATURDAY }, { ...card, weekendSurchargePercent: 0 }).amountAud).toBe(780);
  });

  it("listed public holidays carry the holiday surcharge even on a weekday", () => {
    expect(price({ movingDate: HOLIDAY }).amountAud).toBe(940);
  });

  it("4 movers adds two extra-mover rates to every billable hour (and the crew's own hours)", () => {
    // 6t + 4 movers: 3h + 0.5h drive = 3.5h x (145 + 2 x 80) = 1067.5; + 60 = 1127.5; x1.1 = 1240.25 -> $1240
    const out = price({ movers: 4 });
    expect(out.amountAud).toBe(1240);
    expect(out.customer.includes[0]).toBe("4 movers and a 6 tonne truck");
  });

  it("the chosen truck sets the rate and loading time", () => {
    // 4.5t + 2 movers: 2.5h + 0.5h = 3h x 130 = 390; + 60 = 450; x1.1 = 495 -> $500 (rounds half up)
    expect(price({ truck: "4.5T" }).amountAud).toBe(500);
  });

  it("stairs, long carry and heavy items are priced in, not added later", () => {
    // 2 flights (80) + long carry (60) + 1 heavy item (80) = 220; (712.5 + 220) x 1.1 = 1025.75 -> $1030
    const out = price({ access: { pickupStairFlights: 1, dropoffStairFlights: 1, longCarry: true, heavyItems: 1 } });
    expect(out.amountAud).toBe(1030);
  });

  it("call-out time rounds UP to the next whole hour (61 min bills as 2h)", () => {
    // call-out 120; (652.5 + 120) x 1.1 = 849.75 -> $850
    expect(price({ depotToPickup: { km: 40, minutes: 61 } }).amountAud).toBe(850);
  });

  it("a short job is lifted to the minimum job hours", () => {
    // minimum 5h x 145 = 725; + 60 = 785; x1.1 = 863.5 -> $860
    expect(price({}, { ...card, minimumJobHours: 5 }).amountAud).toBe(860);
  });

  it("always lands on a multiple of the rounding step", () => {
    for (const minutes of [7, 18, 33, 47, 59]) {
      expect(price({ pickupToDropoff: { km: 12, minutes } }).amountAud % 10).toBe(0);
    }
  });

  it("is deterministic: same inputs, same price, same breakdown", () => {
    expect(price()).toEqual(price());
  });
});

describe("what the customer is allowed to see", () => {
  it("is one price plus plain-language inclusions -- no hourly rate, call-out or breakdown", () => {
    const shown = JSON.stringify(price({ firstMoveRequested: true }).customer);
    expect(shown).not.toMatch(/hour|\/hr|per hr|call-?out|rate|subtotal|surcharge/i);
    expect(shown).toContain("movers");
  });

  it("keeps the cost breakdown on the internal side only", () => {
    const out = price();
    expect(Object.keys(out.customer).sort()).toEqual(["amountAud", "firstMoveApplied", "includes", "validDays"]);
    expect(out.internal.crewRateAudPerHour).toBe(145);
  });
});

describe("when it must NOT quote (sent to a person instead)", () => {
  it("junk removal -- there are no junk rates", () => expect(manual({ need: "junk" })).toBe("junk_removal"));
  it("customer asked the team to inspect and confirm capacity", () => expect(manual({ truck: "inspect" })).toBe("site_inspection_requested"));
  it("no truck or crew chosen", () => {
    expect(manual({ truck: null })).toBe("capacity_missing");
    expect(manual({ movers: null })).toBe("capacity_missing");
  });
  it("special items (piano, pool table, safe)", () => expect(manual({ specialItems: true })).toBe("special_items"));
  it("no moving date -- holiday pricing can't be settled", () => expect(manual({ movingDate: null })).toBe("date_missing"));
  it("either distance missing", () => {
    expect(manual({ depotToPickup: null })).toBe("distance_unavailable");
    expect(manual({ pickupToDropoff: null })).toBe("distance_unavailable");
  });
  it("pickup too far from the depot", () => {
    expect(manual({ depotToPickup: { km: 61, minutes: 50 } })).toBe("outside_service_area");
  });
  it("move too long", () => {
    expect(manual({ pickupToDropoff: { km: 81, minutes: 70 } })).toBe("outside_service_area");
  });
  it("GST treatment not confirmed -- never guessed", () => {
    expect(manual({}, { ...card, gst: { ratesIncludeGst: null, ratePercent: 10 } })).toBe("rate_card_incomplete");
  });
  it("weekend surcharge not confirmed -- weekend dates refuse, weekday dates still price", () => {
    const unconfirmed = { ...card, weekendSurchargePercent: null };
    expect(manual({ movingDate: SATURDAY }, unconfirmed)).toBe("rate_card_incomplete");
    expect(price({ movingDate: WEEKDAY }, unconfirmed).amountAud).toBe(780);
  });
  it("public-holiday surcharge not confirmed -- holiday dates refuse, other dates still price", () => {
    const unconfirmed = { ...card, publicHolidaySurchargePercent: null };
    expect(manual({ movingDate: HOLIDAY }, unconfirmed)).toBe("rate_card_incomplete");
    expect(price({ movingDate: SATURDAY }, unconfirmed).amountAud).toBe(940);
  });
  it("loading hours not supplied for a truck + crew -- only that combination refuses", () => {
    const noTwoMovers = { ...card, trucks: { ...card.trucks, "6.0T": { ...card.trucks["6.0T"], labourHours: { "2": null, "4": 3 } } } };
    expect(manual({}, noTwoMovers)).toBe("rate_card_incomplete");
    expect(price({ movers: 4 }, noTwoMovers).amountAud).toBe(1240);
  });
  it("truck rate not supplied -- jobs needing that truck refuse", () => {
    const no35 = { ...card, trucks: { ...card.trucks, "3.5T": { ...card.trucks["3.5T"], hourlyRateAud: null } } };
    expect(manual({ truck: "3.5T" }, no35)).toBe("rate_card_incomplete");
    expect(price({}, no35).amountAud).toBe(780);
  });
  it("service-area limits not set -- can't tell if a job is in range, so refuse", () => {
    const noLimits = { ...card, serviceArea: { ...card.serviceArea, maxMoveKm: null } };
    expect(manual({}, noLimits)).toBe("rate_card_incomplete");
  });
});

describe("Blue Line's real rate card (price guide 2026-10-06 + manager's answers 2026-10-07)", () => {
  it("holds exactly the numbers Blue Line has given", () => {
    const real = getActiveRateCard(); // also proves it passes the schema
    expect(real.trucks["4.5T"].hourlyRateAud).toBe(120);
    expect(real.trucks["6.0T"].hourlyRateAud).toBe(140);
    expect(real.trucks["8.0T"].hourlyRateAud).toBe(140);
    expect(real.extraMoverHourlyRateAud).toBe(60);
    expect(real.minimumJobHours).toBe(2);
    expect(real.gst).toEqual({ ratesIncludeGst: false, ratePercent: 10 });
    expect(real.weekendSurchargePercent).toBe(0);
    expect(real.firstMoveDiscountPercent).toBe(30);
    expect(real.publicHolidays).toContain("2026-12-28");
  });

  it("leaves every unconfirmed value empty instead of guessing", () => {
    expect(blrRateCard.trucks["3.5T"].hourlyRateAud).toBeNull();
    for (const t of Object.values(blrRateCard.trucks)) expect(t.labourHours).toEqual({ "2": null, "4": null });
    expect(blrRateCard.publicHolidaySurchargePercent).toBeNull();
    expect(blrRateCard.serviceArea.maxPickupFromDepotKm).toBeNull();
    expect(blrRateCard.serviceArea.maxMoveKm).toBeNull();
  });

  it("can't produce a price yet -- not even in test mode -- until the gaps are filled", () => {
    expect(manual({}, blrRateCard)).toBe("rate_card_not_confirmed");
    expect(manual({}, blrRateCard, true)).toBe("rate_card_incomplete");
  });
});

describe("placeholder rate card safety latch", () => {
  const placeholder: RateCard = { ...card, status: "placeholder" };

  it("never prices in production mode", () => {
    expect(manual({}, placeholder)).toBe("rate_card_not_confirmed");
  });

  it("only prices when explicitly allowed (local dev / preview)", () => {
    expect(calculateQuote(base, placeholder, { allowPlaceholderRateCard: true }).kind).toBe("price");
  });

  it("the shipped card is not yet signed off", () => {
    expect(blrRateCard.status).toBe("placeholder");
  });
});
