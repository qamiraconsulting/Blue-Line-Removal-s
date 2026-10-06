import { z } from "zod";

// The rate card the flat-price engine reads. Everything the engine needs lives here as
// data, never in the engine itself, so Blue Line can change a number without touching
// the calculation. Each quote stores a snapshot of the card it was priced from.
//
// `status` is the safety latch: a "placeholder" card can NEVER produce a customer-facing
// price in production (calculateQuote returns a manual-review outcome instead). Only
// when Blue Line's real numbers are filled in and `status` is flipped to "confirmed" does
// the form start quoting automatically.

export const truckIds = ["4.5T", "6-8T", "11T"] as const;
export const jobSizeIds = ["studio_1bed", "2_bed", "3_bed", "4plus_bed"] as const;

export type TruckId = (typeof truckIds)[number];
export type JobSizeId = (typeof jobSizeIds)[number];

export const rateCardSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["placeholder", "confirmed"]),

  // Internal only -- hourly figures are never shown to customers.
  trucks: z.record(
    z.enum(truckIds),
    z.object({ label: z.string(), hourlyRateAud: z.number().positive() }),
  ),
  extraMoverHourlyRateAud: z.number().nonnegative(),
  minimumJobHours: z.number().positive(),

  // Call-out: always measured from the depot, so a quote can't change depending on what
  // else is booked. Folded into the single price, never shown as a line.
  callOut: z.object({
    ratePerHourAud: z.number().positive(),
    minimumHours: z.number().positive(),
  }),

  // Loading + unloading labour only (driving is added from the real route).
  jobSizes: z.record(
    z.enum(jobSizeIds),
    z.object({
      truck: z.enum(truckIds),
      movers: z.number().int().min(2),
      labourHours: z.number().positive(),
    }),
  ),

  accessExtras: z.object({
    perStairFlightAud: z.number().nonnegative(),
    longCarryAud: z.number().nonnegative(),
    perHeavyItemAud: z.number().nonnegative(),
  }),

  // null = Blue Line hasn't confirmed it yet; the engine refuses to price rather than guess.
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
    maxPickupFromDepotKm: z.number().positive(),
    maxMoveKm: z.number().positive(),
  }),
});

export type RateCard = z.infer<typeof rateCardSchema>;

/**
 * PLACEHOLDER -- NOT BLUE LINE'S REAL NUMBERS.
 *
 * Truck hourly rates, extra-mover rate, 2-hour minimum, access extras and the call-out
 * rate come from Blue Line's price guide. Everything else is a stand-in so the engine can
 * be built and tested:
 *  - jobSizes (which truck / how many movers / loading+unloading hours per property size)
 *  - GST treatment and weekend/holiday surcharge (null = unconfirmed)
 *  - the public-holiday list (empty until Blue Line says which dates count)
 *  - serviceArea limits
 * `status: "placeholder"` keeps this out of production quoting until it's replaced.
 */
export const placeholderRateCard: RateCard = {
  version: "placeholder-2026-10-06",
  status: "placeholder",

  trucks: {
    "4.5T": { label: "4.5T truck", hourlyRateAud: 130 },
    "6-8T": { label: "6-8T truck", hourlyRateAud: 145 },
    // The price guide says $180-$185; the top of the range is used until Blue Line says which applies.
    "11T": { label: "11T truck", hourlyRateAud: 185 },
  },
  extraMoverHourlyRateAud: 80,
  minimumJobHours: 2,

  callOut: { ratePerHourAud: 60, minimumHours: 1 },

  jobSizes: {
    studio_1bed: { truck: "4.5T", movers: 2, labourHours: 2.5 },
    "2_bed": { truck: "6-8T", movers: 2, labourHours: 4 },
    "3_bed": { truck: "6-8T", movers: 3, labourHours: 5 },
    "4plus_bed": { truck: "11T", movers: 3, labourHours: 7 },
  },

  accessExtras: { perStairFlightAud: 40, longCarryAud: 60, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: null, ratePercent: 10 },
  weekendHolidaySurchargePercent: null,
  publicHolidays: [],

  firstMoveDiscountPercent: 30,
  roundToNearestAud: 10,
  validityDays: 14,

  serviceArea: {
    depotAddress: "Tarneit, VIC, Australia",
    maxPickupFromDepotKm: 60,
    maxMoveKm: 80,
  },
};

// The card currently in force. Swap this for the confirmed card once Blue Line sends the
// real numbers (a database-backed, editable card is a later step).
export function getActiveRateCard(): RateCard {
  return rateCardSchema.parse(placeholderRateCard);
}
