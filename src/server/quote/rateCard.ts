import { z } from "zod";

// The rate card the flat-price engine reads. Everything the engine needs lives here as
// data, never in the engine itself, so Blue Line can change a number without touching
// the calculation. Each quote stores a snapshot of the card it was priced from.
//
// Two safety rules:
//  - Any value Blue Line hasn't confirmed is `null`, and the engine refuses to price
//    (sends the job to a person) rather than guess it.
//  - `status` is a latch: a card that isn't "confirmed" can NEVER produce a customer-facing
//    price in production, even once every value is filled in. Flip it to "confirmed" only
//    after Blue Line has signed the numbers off.

export const truckIds = ["4.5T", "6-8T", "10T"] as const;
export const jobSizeIds = ["studio_1bed", "2_bed", "3_bed", "4plus_bed"] as const;

export type TruckId = (typeof truckIds)[number];
export type JobSizeId = (typeof jobSizeIds)[number];

export const rateCardSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["placeholder", "confirmed"]),

  // Internal only -- hourly figures are never shown to customers.
  trucks: z.record(
    z.enum(truckIds),
    z.object({ label: z.string(), hourlyRateAud: z.number().positive().nullable() }),
  ),
  extraMoverHourlyRateAud: z.number().nonnegative(),
  minimumJobHours: z.number().positive(),

  // Call-out: always measured from the depot, so a quote can't change depending on what
  // else is booked. Folded into the single price, never shown as a line.
  callOut: z.object({
    ratePerHourAud: z.number().positive(),
    minimumHours: z.number().positive(),
  }),

  // Which truck, how many movers and how many loading + unloading hours a typical job of
  // each size takes (driving is added from the real route). null = not supplied yet.
  jobSizes: z.record(
    z.enum(jobSizeIds),
    z
      .object({
        truck: z.enum(truckIds),
        movers: z.number().int().min(2),
        labourHours: z.number().positive(),
      })
      .nullable(),
  ),

  accessExtras: z.object({
    perStairFlightAud: z.number().nonnegative(),
    longCarryAud: z.number().nonnegative(),
    perHeavyItemAud: z.number().nonnegative(),
  }),

  gst: z.object({
    ratesIncludeGst: z.boolean().nullable(),
    ratePercent: z.number().positive(),
  }),
  weekendHolidaySurchargePercent: z.number().min(0).max(100).nullable(),
  publicHolidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),

  firstMoveDiscountPercent: z.number().min(0).max(100),
  roundToNearestAud: z.number().positive(),
  validityDays: z.number().int().positive(),

  serviceArea: z.object({
    depotAddress: z.string().min(1),
    maxPickupFromDepotKm: z.number().positive().nullable(),
    maxMoveKm: z.number().positive().nullable(),
  }),
});

export type RateCard = z.infer<typeof rateCardSchema>;

/**
 * Blue Line Removals' price guide, as received 2026-10-06.
 *
 * Filled in ONLY where the guide is explicit: truck rates for the 4.5T and 6-8T crews,
 * extra mover, 2-hour minimum, stairs, heavy item, long carry, 10% GST rate, and the
 * 30% first-move offer (from the live site).
 *
 * Still null, pending Blue Line's answer -- the engine will not price while any of these
 * is needed:
 *  - 10T truck: the guide gives a range ($160-$180/hr), not one rate
 *  - jobSizes: truck / movers / loading+unloading hours per property size
 *  - GST: whether the guide's rates include GST ("subject to 10% GST")
 *  - weekend / public-holiday surcharge (the guide doesn't mention one)
 *  - service-area limits
 * Call-out uses the formula Ayesha confirmed on 2026-08-21 ($60/hr of travel from the
 * Tarneit depot, 1-hour minimum, rounded up); the new guide doesn't state a number, so
 * this is awaiting re-confirmation. Rounding ($10) and validity (14 days) are proposed
 * defaults awaiting sign-off.
 */
export const blrRateCard: RateCard = {
  version: "blr-price-guide-2026-10-06",
  status: "placeholder",

  trucks: {
    "4.5T": { label: "4.5T truck", hourlyRateAud: 120 },
    "6-8T": { label: "6-8T truck", hourlyRateAud: 140 },
    "10T": { label: "10T truck", hourlyRateAud: null },
  },
  extraMoverHourlyRateAud: 60,
  minimumJobHours: 2,

  callOut: { ratePerHourAud: 60, minimumHours: 1 },

  jobSizes: {
    studio_1bed: null,
    "2_bed": null,
    "3_bed": null,
    "4plus_bed": null,
  },

  accessExtras: { perStairFlightAud: 40, longCarryAud: 40, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: null, ratePercent: 10 },
  weekendHolidaySurchargePercent: null,
  publicHolidays: [],

  firstMoveDiscountPercent: 30,
  roundToNearestAud: 10,
  validityDays: 14,

  serviceArea: {
    depotAddress: "Tarneit, VIC, Australia",
    maxPickupFromDepotKm: null,
    maxMoveKm: null,
  },
};

export function getActiveRateCard(): RateCard {
  return rateCardSchema.parse(blrRateCard);
}
