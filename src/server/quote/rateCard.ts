import { z } from "zod";

// The rate card the estimate engine reads. Everything the engine needs lives here as
// data, never in the engine itself, so Blue Line can change a number without touching
// the calculation. Each quote stores a snapshot of the card it was priced from.
//
// Two safety rules:
//  - Any value Blue Line hasn't confirmed is `null`, and the engine refuses to price
//    (sends the job to a person) rather than guess it. Every null is tracked in
//    src/server/openItems.ts (a test enforces it).
//  - `status` is a latch: a card that isn't "confirmed" can NEVER produce a customer-facing
//    price in production, even once every value is filled in. Flip it to "confirmed" only
//    after Blue Line has signed the numbers off.

export const truckIds = ["4.5T", "6-8T", "10T"] as const;
export const moverCounts = [2, 3, 4] as const;
export const homeSizeIds = ["studio_1bed", "2_bed", "3_bed", "4plus_bed"] as const;

export type TruckId = (typeof truckIds)[number];
export type MoverCount = (typeof moverCounts)[number];
export type HomeSizeId = (typeof homeSizeIds)[number];

export const rateCardSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["placeholder", "confirmed"]),

  // Hourly rate for the truck with 2 movers, excluding GST. Internal only -- hourly
  // figures are never shown to customers. Charged from arrival at the pickup until
  // unloading is finished at the drop-off; the call-out is included, never charged.
  trucks: z.record(z.enum(truckIds), z.object({ label: z.string(), hourlyRateAud: z.number().positive().nullable() })),
  extraMoverHourlyRateAud: z.number().nonnegative(),
  minimumJobHours: z.number().positive(),

  // Home size guide: the truck and crew that usually suit each home size, and how long
  // the job usually takes. The customer may choose a different truck or crew; the guide's
  // hours are still used. null = not supplied yet.
  jobSizes: z.record(
    z.enum(homeSizeIds),
    z
      .object({
        truck: z.enum(truckIds),
        movers: z.number().int().min(2).max(4),
        typicalHours: z.number().positive(),
      })
      .nullable(),
  ),
  // Do the guide's typical hours already include driving between the two addresses?
  // false = add the real drive time (Google) on top. null = not confirmed.
  typicalHoursIncludeDriving: z.boolean().nullable(),

  // Supported by the engine but not collected yet: the form takes free-text access notes
  // (stairs, parking distance, heavy items), which go to the team with the estimate.
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

  // First-order discount: off the full subtotal excluding GST; GST is then added to the
  // discounted amount.
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
 * Blue Line Removals' rates as set out in Ayesha's email of 2026-10-12 ("Blue Line Removals
 * chatbot: pricing confirmation and a few open points", Part A) -- the email supersedes the
 * earlier price guide and the 2026-10-07 truck/crew screenshot.
 *
 * Part A, filled in:
 *  - 4.5T $130/hr, 6-8T $140/hr, 10T $180/hr (2 movers, excl. GST); extra mover $60/hr;
 *    2-hour minimum; customer chooses 2, 3 or 4 movers, or a site inspection
 *  - charged from arrival at pickup to end of unloading; call-out included, not charged
 *  - stairs $40/flight, heavy item $80, long carry $40 (piano and packing: personal quote)
 *  - 10% first-order discount on the full subtotal, then 10% GST on the discounted amount
 *  - defaults: round to nearest $10, valid 10 days, one discount per email or phone
 *
 * Blue Line's replies to Part B (the same email, answered inline; pasted by Ayesha 2026-10-25):
 *  - B1 home size guide: studio/1 bed 4.5T 2 movers 2 h; 2 bed 4.5T 2 movers 3 h; 3 bed 6-8T
 *    2 movers 5 h; 4+ bed 10T 3 movers 7 h. The hours are "to load and unload" -- they do NOT
 *    include driving, so the engine adds the real drive between the addresses on top
 *  - B2 weekends / public holidays: no surcharge (0%)
 *  - B4 long carry ($40): always applies at an apartment pick-up and drop-off (per end), and
 *    at any property when the truck can't park within 50 m of the door
 *  - B5 service area: 120 km radius from Tarneit (used for the pick-up AND the move length)
 *  - B6 free wrapping of furniture (bubble wrap, shrink wrap, blankets); boxes are charged
 *
 * Call-out: never charged by the chatbot or the website estimate (Ayesha's manager, 28 Oct).
 * `status` stays "placeholder" (test figures only) until Blue Line signs the card off.
 * Still open (src/server/openItems.ts): the heavy-items list (B3) and the WhatsApp number (B8).
 */
export const blrRateCard: RateCard = {
  version: "blr-email-2026-10-25",
  status: "placeholder",

  trucks: {
    "4.5T": { label: "4.5 tonne truck", hourlyRateAud: 130 },
    "6-8T": { label: "6-8 tonne truck", hourlyRateAud: 140 },
    "10T": { label: "10 tonne truck", hourlyRateAud: 180 },
  },
  extraMoverHourlyRateAud: 60,
  minimumJobHours: 2,

  // B1, Blue Line's reply: hours are to LOAD AND UNLOAD only, so drive time is added by the engine.
  jobSizes: {
    studio_1bed: { truck: "4.5T", movers: 2, typicalHours: 2 },
    "2_bed": { truck: "4.5T", movers: 2, typicalHours: 3 },
    "3_bed": { truck: "6-8T", movers: 2, typicalHours: 5 },
    "4plus_bed": { truck: "10T", movers: 3, typicalHours: 7 },
  },
  typicalHoursIncludeDriving: false,

  accessExtras: { perStairFlightAud: 40, longCarryAud: 40, perHeavyItemAud: 80 },

  gst: { ratesIncludeGst: false, ratePercent: 10 },
  // B2, Blue Line's reply: no surcharge on weekends or public holidays.
  weekendSurchargePercent: 0,
  publicHolidaySurchargePercent: 0,
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

  firstMoveDiscountPercent: 10,
  roundToNearestAud: 10,
  validityDays: 10,

  serviceArea: {
    depotAddress: "Tarneit, VIC, Australia",
    // B5, Blue Line's reply: "120 km radius from Tarneit" -- used for both limits.
    maxPickupFromDepotKm: 120,
    maxMoveKm: 120,
  },
};

export function getActiveRateCard(): RateCard {
  return rateCardSchema.parse(blrRateCard);
}
