import type { RateCard } from "./rateCard.js";

// TEST ONLY. A complete, confirmed card with round made-up numbers so every expected price
// in the tests can be checked by hand. Deliberately independent of Blue Line's real card,
// so updating real prices never breaks the arithmetic tests. Never import this from app code.
//
// Rates are ex-GST (GST added on top), real drive time added to the guide's hours,
// weekend +20%, public holiday +20%, 10% first-order discount, round to $10.
export const fixtureRateCard: RateCard = {
  version: "test-v1",
  status: "confirmed",

  trucks: {
    "4.5T": { label: "4.5 tonne truck", hourlyRateAud: 130 },
    "6-8T": { label: "6-8 tonne truck", hourlyRateAud: 145 },
    "10T": { label: "10 tonne truck", hourlyRateAud: 185 },
  },
  extraMoverHourlyRateAud: 80,
  minimumJobHours: 2,
  allowedMovers: { "4.5T": [2, 3, 4], "6-8T": [2, 3, 4], "10T": [2, 3, 4] },

  jobSizes: {
    studio_1bed: { truck: "4.5T", movers: 2, typicalHours: 2.5 },
    "2_bed": { truck: "6-8T", movers: 2, typicalHours: 4 },
    "3_bed": { truck: "6-8T", movers: 3, typicalHours: 5 },
    "4plus_bed": { truck: "10T", movers: 3, typicalHours: 7 },
  },
  typicalHoursIncludeDriving: false,

  accessExtras: { perStairFlightAud: 40, longCarryAud: 60, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: false, ratePercent: 10 },
  weekendSurchargePercent: 20,
  publicHolidaySurchargePercent: 20,
  publicHolidays: ["2026-11-03"], // a Tuesday

  firstMoveDiscountPercent: 10,
  roundToNearestAud: 10,
  validityDays: 14,

  serviceArea: { depotAddress: "Tarneit, VIC, Australia", maxPickupFromDepotKm: 60, maxMoveKm: 80 },
};
