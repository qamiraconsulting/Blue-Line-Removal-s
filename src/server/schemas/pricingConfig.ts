import { z } from "zod";

// The shape of pricing_config.rules (jsonb). This is the single source of
// truth for every number the Pricing Engine uses -- versioned, editable via
// a future admin form, never hardcoded into the engine itself. Two fields
// are nullable and PENDING: Blue Line hasn't confirmed the weekend/holiday
// uplift or whether the rate-card figures are GST-inclusive. The engine
// must refuse to produce a customer-facing price while either is null
// rather than silently assuming a value -- see pricingEngine.ts.

export const truckTierSchema = z.object({
  id: z.string(), // "4.5T" | "6-8T" | "11T"
  label: z.string(), // e.g. "2 Movers + 4.5T Truck"
  // 11T is a range on the real rate card ($180-$185/hr); the other two
  // tiers are a single confirmed rate. min === max for those.
  hourlyRateAudMin: z.number().positive(),
  hourlyRateAudMax: z.number().positive(),
  baseCrewSize: z.number().int().positive().default(2),
});

export const pricingConfigRulesSchema = z.object({
  truckTiers: z.array(truckTierSchema).min(1),
  minimumBookingHours: z.number().positive(),
  additionalMoverHourlyRateAud: z.number().positive(),

  additionalCharges: z.object({
    stairsPerFlightAud: z.number().nonnegative(),
    heavyItemSurchargeAud: z.number().nonnegative(),
    pianoMovingFromAud: z.number().nonnegative(),
    longCarryAud: z.number().nonnegative(),
  }),

  // PENDING -- weekend/public-holiday % uplift, not yet confirmed by Blue
  // Line (roadmap Phase 0). Null means "don't apply a weekend surcharge
  // yet" -- the engine flags this explicitly rather than defaulting to 0,
  // since 0% is a business claim ("no weekend surcharge"), not an absence
  // of data.
  weekendHolidaySurchargePercent: z.number().min(0).max(100).nullable(),

  // PENDING -- confirmed the price-guide figures are inclusive or exclusive
  // of the 10% GST. Never assume; the engine refuses to price without this.
  gstMode: z.enum(["inclusive", "exclusive"]).nullable(),
  gstRatePercent: z.number().positive().default(10),

  // The confirmed call-out/travel-fee formula (2026-08-21):
  // max(1, ceil(travel_hours)) x ratePerHourAud, where travel_hours comes
  // from calculate_route() between the truck's last known location
  // (depotAddress for the day's first job, otherwise the previous booking's
  // drop-off) and the new pickup address.
  callOut: z.object({
    depotAddress: z.string(), // Tarneit, VIC -- exact street address still TBC
    ratePerHourAud: z.number().positive(), // 60
    minimumHours: z.number().positive(), // 1
    roundingRule: z.literal("up_to_full_hour"),
  }),
});

export type PricingConfigRules = z.infer<typeof pricingConfigRulesSchema>;

// The default/seed config -- everything we have real numbers for today.
// weekendHolidaySurchargePercent and gstMode are deliberately null. This
// is meant to be inserted as pricing_config row 1 (config_version "v1",
// active: true) once the database exists; do not treat the nulls below as
// "figure it out later" placeholders anywhere else in the codebase --
// pricingEngine.ts is the one place that's allowed to branch on them.
export const seedPricingConfigRules: PricingConfigRules = {
  truckTiers: [
    { id: "4.5T", label: "2 Movers + 4.5T Truck", hourlyRateAudMin: 130, hourlyRateAudMax: 130, baseCrewSize: 2 },
    {
      id: "6-8T",
      label: "2 Movers + 6-8T Medium Truck",
      hourlyRateAudMin: 145,
      hourlyRateAudMax: 145,
      baseCrewSize: 2,
    },
    { id: "11T", label: "2 Movers + 11T Truck", hourlyRateAudMin: 180, hourlyRateAudMax: 185, baseCrewSize: 2 },
  ],
  minimumBookingHours: 2,
  additionalMoverHourlyRateAud: 80,
  additionalCharges: {
    stairsPerFlightAud: 40,
    heavyItemSurchargeAud: 80,
    pianoMovingFromAud: 200,
    longCarryAud: 60,
  },
  weekendHolidaySurchargePercent: null,
  gstMode: null,
  gstRatePercent: 10,
  callOut: {
    depotAddress: "Tarneit, VIC",
    ratePerHourAud: 60,
    minimumHours: 1,
    roundingRule: "up_to_full_hour",
  },
};
