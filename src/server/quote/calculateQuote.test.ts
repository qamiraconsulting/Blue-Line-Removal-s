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
  propertySize: "2_bed", // guide: 6-8T ($145/hr), 2 movers, 4 typical hours
  truck: null,
  movers: null,
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

describe("estimate arithmetic (hand-checked)", () => {
  it("2 bed on the guide's truck and crew: (4h + 30min drive) x $145, +10% GST, rounded", () => {
    // 4.5h x 145 = 652.5; GST 65.25; 717.75 -> $720
    const out = price();
    expect(out.amountAud).toBe(720);
    expect(out.internal).toMatchObject({ truck: "6-8T", movers: 2, capacityFrom: "guide", jobHours: 4.5, subtotalAud: 652.5, gstAud: 65.25 });
  });

  it("matches the worked example in the 12 Oct email: 1 hour, 4.5T + 2 movers, first order = $128.70", () => {
    // $130 less 10% ($13) = $117, plus GST ($11.70) = $128.70
    const emailCard: RateCard = {
      ...blrRateCard,
      status: "confirmed",
      minimumJobHours: 1,
      jobSizes: { ...blrRateCard.jobSizes, studio_1bed: { truck: "4.5T", movers: 2, typicalHours: 1 } },
      typicalHoursIncludeDriving: true,
      weekendSurchargePercent: 0,
      publicHolidaySurchargePercent: 0,
      serviceArea: { ...blrRateCard.serviceArea, maxPickupFromDepotKm: 60, maxMoveKm: 80 },
    };
    const out = price({ propertySize: "studio_1bed", firstMoveRequested: true }, emailCard);
    expect(out.internal).toMatchObject({ subtotalAud: 130, discountAud: 13, gstAud: 11.7, unroundedAud: 128.7 });
    expect(out.amountAud).toBe(130);
  });

  it("no call-out: how far the pickup is from the depot doesn't change the estimate", () => {
    expect(price({ depotToPickup: { km: 55, minutes: 70 } }).amountAud).toBe(720);
  });

  it("rates that already include GST are not taxed twice", () => {
    expect(price({}, { ...card, gst: { ratesIncludeGst: true, ratePercent: 10 } }).amountAud).toBe(650);
  });

  it("first-order discount comes off the subtotal excluding GST; GST is added to the discounted amount", () => {
    // 652.5 - 10% (65.25) = 587.25; GST 58.725; 645.975 -> $650
    const out = price({ firstMoveRequested: true, firstMoveEligible: true });
    expect(out.amountAud).toBe(650);
    expect(out.customer.firstMoveApplied).toBe(true);
    expect(out.internal).toMatchObject({ subtotalAud: 652.5, discountAud: 65.25 });
  });

  it("first-order discount is NOT applied when the customer isn't eligible", () => {
    const out = price({ firstMoveRequested: true, firstMoveEligible: false });
    expect(out.amountAud).toBe(720);
    expect(out.customer.firstMoveApplied).toBe(false);
  });

  it("the customer can choose more movers than the guide -- the guide's hours still apply", () => {
    // 3 movers: 4.5h x (145 + 80) = 1012.5 x 1.1 = 1113.75 -> $1110
    expect(price({ movers: 3 }).amountAud).toBe(1110);
    // 4 movers: 4.5h x (145 + 160) = 1372.5 x 1.1 = 1509.75 -> $1510
    const four = price({ movers: 4 });
    expect(four.amountAud).toBe(1510);
    expect(four.customer.includes[0]).toBe("4 movers and a 6-8 tonne truck");
    expect(four.internal.capacityFrom).toBe("customer");
  });

  it("'let the team inspect on the day' still gets an estimate, on the guide's truck and crew", () => {
    // the inspection happens on the move day, so the booking is made on this estimate
    const out = price({ truck: "inspect", movers: 4 });
    expect(out.amountAud).toBe(720); // guide's 6-8T + 2 movers, not the 4 movers sent alongside
    expect(out.internal).toMatchObject({ truck: "6-8T", movers: 2, capacityFrom: "inspection" });
    expect(out.customer.includes[0]).toBe("2 movers and a 6-8 tonne truck (our team confirms what's needed on the day)");
  });

  it("the customer can choose a different truck", () => {
    // 10T: 4.5h x 185 = 832.5 x 1.1 = 915.75 -> $920
    expect(price({ truck: "10T" }).amountAud).toBe(920);
  });

  it("without a choice, the guide's truck and crew for that home size are used", () => {
    // 3 bed: 6-8T + 3 movers, 5h + 0.5h = 5.5h x 225 = 1237.5 x 1.1 = 1361.25 -> $1360
    const out = price({ propertySize: "3_bed" });
    expect(out.amountAud).toBe(1360);
    expect(out.customer.includes[0]).toBe("3 movers and a 6-8 tonne truck");
  });

  it("when the guide's hours already include driving, the drive isn't added again", () => {
    // 4h x 145 = 580 x 1.1 = 638 -> $640
    expect(price({}, { ...card, typicalHoursIncludeDriving: true }).amountAud).toBe(640);
  });

  it("weekends and public holidays carry their surcharge", () => {
    // 652.5 x 1.2 = 783; x1.1 = 861.3 -> $860
    expect(price({ movingDate: SATURDAY }).amountAud).toBe(860);
    expect(price({ movingDate: HOLIDAY }).amountAud).toBe(860);
    expect(price({ movingDate: SATURDAY }, { ...card, weekendSurchargePercent: 0 }).amountAud).toBe(720);
  });

  it("stairs, long carry and heavy items are priced in when known", () => {
    // 2 flights (80) + long carry (60) + 1 heavy item (80) = 220; (652.5 + 220) x 1.1 = 959.75 -> $960
    const out = price({ access: { pickupStairFlights: 1, dropoffStairFlights: 1, longCarry: true, heavyItems: 1 } });
    expect(out.amountAud).toBe(960);
  });

  it("a short job is lifted to the minimum booking", () => {
    // minimum 5h x 145 = 725 x 1.1 = 797.5 -> $800
    expect(price({}, { ...card, minimumJobHours: 5 }).amountAud).toBe(800);
  });

  it("always lands on a multiple of the rounding step, and is deterministic", () => {
    for (const minutes of [7, 18, 33, 47, 59]) {
      expect(price({ pickupToDropoff: { km: 12, minutes } }).amountAud % 10).toBe(0);
    }
    expect(price()).toEqual(price());
  });
});

describe("what the customer is allowed to see", () => {
  it("is one number plus plain-language inclusions -- no hourly rate, call-out or breakdown", () => {
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

describe("when it must NOT estimate (sent to a person instead)", () => {
  it("junk removal -- there are no junk rates", () => expect(manual({ need: "junk" })).toBe("junk_removal"));
  it("no home size given", () => expect(manual({ propertySize: null })).toBe("size_missing"));
  it("office moves and 'not sure' sizes", () => {
    expect(manual({ propertySize: "commercial" })).toBe("commercial_or_unsure_size");
    expect(manual({ propertySize: "unsure" })).toBe("commercial_or_unsure_size");
  });
  it("special items (piano, pool table, safe)", () => expect(manual({ specialItems: true })).toBe("special_items"));
  it("no moving date", () => expect(manual({ movingDate: null })).toBe("date_missing"));
  it("either distance missing", () => {
    expect(manual({ depotToPickup: null })).toBe("distance_unavailable");
    expect(manual({ pickupToDropoff: null })).toBe("distance_unavailable");
  });
  it("outside the service area", () => {
    expect(manual({ depotToPickup: { km: 61, minutes: 50 } })).toBe("outside_service_area");
    expect(manual({ pickupToDropoff: { km: 81, minutes: 70 } })).toBe("outside_service_area");
  });
  it("home size guide missing for that size -- only that size refuses", () => {
    const noTwoBed = { ...card, jobSizes: { ...card.jobSizes, "2_bed": null } };
    expect(manual({}, noTwoBed)).toBe("rate_card_incomplete");
    expect(price({ propertySize: "3_bed" }, noTwoBed).amountAud).toBe(1360);
  });
  it("not confirmed whether the guide's hours include driving", () => {
    expect(manual({}, { ...card, typicalHoursIncludeDriving: null })).toBe("rate_card_incomplete");
  });
  it("GST treatment not confirmed", () => {
    expect(manual({}, { ...card, gst: { ratesIncludeGst: null, ratePercent: 10 } })).toBe("rate_card_incomplete");
  });
  it("weekend surcharge not confirmed -- weekends refuse, weekdays still estimate", () => {
    const unconfirmed = { ...card, weekendSurchargePercent: null };
    expect(manual({ movingDate: SATURDAY }, unconfirmed)).toBe("rate_card_incomplete");
    expect(price({}, unconfirmed).amountAud).toBe(720);
  });
  it("public-holiday surcharge not confirmed -- holidays refuse, other days still estimate", () => {
    const unconfirmed = { ...card, publicHolidaySurchargePercent: null };
    expect(manual({ movingDate: HOLIDAY }, unconfirmed)).toBe("rate_card_incomplete");
    expect(price({ movingDate: SATURDAY }, unconfirmed).amountAud).toBe(860);
  });
  it("service-area limits not set", () => {
    expect(manual({}, { ...card, serviceArea: { ...card.serviceArea, maxMoveKm: null } })).toBe("rate_card_incomplete");
  });
});

describe("Blue Line's real rate card (Ayesha's email of 12 Oct 2026, Part A)", () => {
  it("holds exactly the rates in the email", () => {
    const real = getActiveRateCard(); // also proves it passes the schema
    expect(real.trucks["4.5T"].hourlyRateAud).toBe(130);
    expect(real.trucks["6-8T"].hourlyRateAud).toBe(140);
    expect(real.trucks["10T"].hourlyRateAud).toBe(180);
    expect(real.extraMoverHourlyRateAud).toBe(60);
    expect(real.minimumJobHours).toBe(2);
    expect(real.accessExtras).toEqual({ perStairFlightAud: 40, longCarryAud: 40, perHeavyItemAud: 80 });
    expect(real.gst).toEqual({ ratesIncludeGst: false, ratePercent: 10 });
    expect(real.firstMoveDiscountPercent).toBe(10);
    expect(real.roundToNearestAud).toBe(10);
    expect(real.validityDays).toBe(10);
  });

  it("leaves everything asked in Part B empty instead of guessing", () => {
    expect(Object.values(blrRateCard.jobSizes).every((j) => j === null)).toBe(true);
    expect(blrRateCard.typicalHoursIncludeDriving).toBeNull();
    expect(blrRateCard.weekendSurchargePercent).toBeNull();
    expect(blrRateCard.publicHolidaySurchargePercent).toBeNull();
    expect(blrRateCard.serviceArea.maxPickupFromDepotKm).toBeNull();
    expect(blrRateCard.serviceArea.maxMoveKm).toBeNull();
  });

  it("can't produce an estimate yet -- not even in test mode -- until Part B is answered", () => {
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
