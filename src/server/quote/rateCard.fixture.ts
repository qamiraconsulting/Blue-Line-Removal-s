import type { RateCard } from "./rateCard.js";

// TEST ONLY. A complete, confirmed card with round made-up numbers so every expected price
// in the tests can be checked by hand. Deliberately independent of Blue Line's real card,
// so updating real prices never breaks the arithmetic tests. Never import this from app code.
//
// Rates are ex-GST (GST added on top), weekend/holiday +20%, round to the nearest $10.
export const fixtureRateCard: RateCard = {
  version: "test-v1",
  status: "confirmed",

  trucks: {
    "4.5T": { label: "4.5T truck", hourlyRateAud: 130 },
    "6-8T": { label: "6-8T truck", hourlyRateAud: 145 },
    "10T": { label: "10T truck", hourlyRateAud: 185 },
  },
  extraMoverHourlyRateAud: 80,
  minimumJobHours: 2,

  callOut: { ratePerHourAud: 60, minimumHours: 1 },

  jobSizes: {
    studio_1bed: { truck: "4.5T", movers: 2, labourHours: 2.5 },
    "2_bed": { truck: "6-8T", movers: 2, labourHours: 4 },
    "3_bed": { truck: "6-8T", movers: 3, labourHours: 5 },
    "4plus_bed": { truck: "10T", movers: 3, labourHours: 7 },
  },

  accessExtras: { perStairFlightAud: 40, longCarryAud: 60, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: false, ratePercent: 10 },
  weekendHolidaySurchargePercent: 20,
  publicHolidays: ["2026-11-03"], // a Tuesday

  firstMoveDiscountPercent: 30,
  roundToNearestAud: 10,
  validityDays: 14,

  serviceArea: { depotAddress: "Tarneit, VIC, Australia", maxPickupFromDepotKm: 60, maxMoveKm: 80 },
};
