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

// What the quote form offers (2026-10-07): the customer picks the truck and crew, or asks
// the team to inspect. Truck rates include 2 movers; each extra mover is added on top.
export const truckIds = ["3.5T", "4.5T", "6.0T", "8.0T"] as const;
export const moverCounts = [2, 4] as const;

export type TruckId = (typeof truckIds)[number];
export type MoverCount = (typeof moverCounts)[number];

const hoursOrNull = z.number().positive().nullable();

export const rateCardSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["placeholder", "confirmed"]),

  // Internal only -- hourly figures are never shown to customers.
  trucks: z.record(
    z.enum(truckIds),
    z.object({
      label: z.string(),
      hourlyRateAud: z.number().positive().nullable(),
      // Loading + unloading hours for a full load of this truck with each crew size.
      // Driving between the addresses is added from the real route.
      labourHours: z.object({ "2": hoursOrNull, "4": hoursOrNull }),
    }),
  ),
  extraMoverHourlyRateAud: z.number().nonnegative(),
  minimumJobHours: z.number().positive(),

  // Call-out: always measured from the depot, so a quote can't change depending on what
  // else is booked. Folded into the single price, never shown as a line.
  callOut: z.object({
    ratePerHourAud: z.number().positive(),
    minimumHours: z.number().positive(),
  }),

  // Supported by the engine but not collected yet: the form takes free-text access notes
  // instead (stairs, parking distance, heavy items), which go to the team with the quote.
  accessExtras: z.object({
    perStairFlightAud: z.number().nonnegative(),
    longCarryAud: z.number().nonnegative(),
    perHeavyItemAud: z.number().nonnegative(),
  }),

  gst: z.object({
    ratesIncludeGst: z.boolean().nullable(),
    ratePercent: z.number().positive(),
  }),
  weekendSurchargePercent: z.number().min(0).max(100).nullable(),
  publicHolidaySurchargePercent: z.number().min(0).max(100).nullable(),
  publicHolidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),

  // Taken off the charges EXCLUDING GST; GST is then 10% of the discounted price.
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
 * Blue Line Removals' price guide (received 2026-10-06) plus the manager's answers of
 * 2026-10-07. Filled in ONLY where stated:
 *  - 4.5T $120/hr; 6.0T and 8.0T $140/hr (the guide's "6-8T" rate); extra mover $60/hr;
 *    2-hour minimum; stairs $40, long carry $40, heavy item $80
 *  - GST 10% on top of the rates ("30% discount is applicable on the actual charges
 *    excluding GST")
 *  - no weekend surcharge; call-out kept inside the price, never shown
 *  - 30% first-move offer on the charges excluding GST
 *
 * Still null, pending Blue Line -- the engine will not price while any of these is needed:
 *  - 3.5T hourly rate (not on the guide)
 *  - loading + unloading hours per truck and crew size
 *  - public-holiday surcharge ("need to check with BLR team")
 *  - service-area limits ("to be confirmed with BLR team")
 * Call-out uses the formula confirmed 2026-08-21 ($60/hr of travel from the Tarneit depot,
 * 1-hour minimum, rounded up). Rounding ($10) and validity (14 days) were proposed and
 * not objected to.
 */
export const blrRateCard: RateCard = {
  version: "blr-price-guide-2026-10-07",
  status: "placeholder",

  trucks: {
    "3.5T": { label: "3.5 tonne truck", hourlyRateAud: null, labourHours: { "2": null, "4": null } },
    "4.5T": { label: "4.5 tonne truck", hourlyRateAud: 120, labourHours: { "2": null, "4": null } },
    "6.0T": { label: "6 tonne truck", hourlyRateAud: 140, labourHours: { "2": null, "4": null } },
    "8.0T": { label: "8 tonne truck", hourlyRateAud: 140, labourHours: { "2": null, "4": null } },
  },
  extraMoverHourlyRateAud: 60,
  minimumJobHours: 2,

  callOut: { ratePerHourAud: 60, minimumHours: 1 },

  accessExtras: { perStairFlightAud: 40, longCarryAud: 40, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: false, ratePercent: 10 },
  weekendSurchargePercent: 0,
  publicHolidaySurchargePercent: null,
  // Victorian public holidays from today on (business.vic.gov.au). Add the 2027 AFL Grand
  // Final eve once the AFL fixes the date.
  publicHolidays: [
    "2026-11-03", // Melbourne Cup
    "2026-12-25",
    "2026-12-26",
    "2026-12-28", // additional day for Boxing Day
    "2027-01-01",
    "2027-01-26",
    "2027-03-08", // Labour Day
    "2027-03-26", // Good Friday
    "2027-03-27",
    "2027-03-28",
    "2027-03-29", // Easter Monday
    "2027-04-25", // Anzac Day
    "2027-06-14", // King's Birthday
    "2027-11-02", // Melbourne Cup
    "2027-12-25",
    "2027-12-26",
    "2027-12-27", // additional day for Christmas
    "2027-12-28", // additional day for Boxing Day
  ],

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
