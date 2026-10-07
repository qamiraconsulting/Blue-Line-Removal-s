import type { RateCard } from "./rateCard.js";

// TEST ONLY. A complete, confirmed card with round made-up numbers so every expected price
// in the tests can be checked by hand. Deliberately independent of Blue Line's real card,
// so updating real prices never breaks the arithmetic tests. Never import this from app code.
//
// Rates are ex-GST (GST added on top), weekend +20%, public holiday +20%, round to $10.
export const fixtureRateCard: RateCard = {
  version: "test-v1",
  status: "confirmed",

  trucks: {
    "3.5T": { label: "3.5 tonne truck", hourlyRateAud: 110, labourHours: { "2": 2, "4": 1.5 } },
    "4.5T": { label: "4.5 tonne truck", hourlyRateAud: 130, labourHours: { "2": 2.5, "4": 2 } },
    "6.0T": { label: "6 tonne truck", hourlyRateAud: 145, labourHours: { "2": 4, "4": 3 } },
    "8.0T": { label: "8 tonne truck", hourlyRateAud: 185, labourHours: { "2": 7, "4": 5 } },
  },
  extraMoverHourlyRateAud: 80,
  minimumJobHours: 2,

  callOut: { ratePerHourAud: 60, minimumHours: 1 },

  accessExtras: { perStairFlightAud: 40, longCarryAud: 60, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: false, ratePercent: 10 },
  weekendSurchargePercent: 20,
  publicHolidaySurchargePercent: 20,
  publicHolidays: ["2026-11-03"], // a Tuesday

  firstMoveDiscountPercent: 30,
  roundToNearestAud: 10,
  validityDays: 14,

  serviceArea: { depotAddress: "Tarneit, VIC, Australia", maxPickupFromDepotKm: 60, maxMoveKm: 80 },
};
