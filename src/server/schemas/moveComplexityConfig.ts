import { z } from "zod";

// Coefficients for the Move Complexity Engine (architecture doc Section 8).
// Every field here is a placeholder pending Blue Line's real operational
// figures -- how long a crew actually takes to load a sofa, how much extra
// time a flight of stairs adds -- none of this was specified anywhere in
// the original brief or the architecture doc, only the formula shape was.
// See moveComplexityEngine.ts for where this gets flagged loudly rather
// than silently trusted.

export const moveComplexityConfigSchema = z.object({
  // Minutes added per flight of stairs when there's no lift available.
  accessAdjustment: z.object({
    stairsPerFlightMinutes: z.number().nonnegative(),
    longCarryMinutes: z.number().nonnegative(),
    restrictedParkingMinutes: z.number().nonnegative(),
  }),
  specialHandling: z.object({
    heavyItemMinutes: z.number().nonnegative(),
    packingRequiredMinutes: z.number().nonnegative(),
  }),
  // Move-size buckets derived from total cubic volume -- also unconfirmed;
  // these thresholds are a reasonable-looking guess, not a Blue Line figure.
  moveSizeThresholds: z.object({
    smallMaxCubicVolume: z.number().positive(),
    mediumMaxCubicVolume: z.number().positive(),
  }),
  // 0-100 complexity score weighting, used internally for triage (e.g.
  // auto-flagging human_followup_required above a threshold) -- never
  // shown to the customer as a number, per Section 8.
  complexityScoreWeights: z.object({
    accessDifficulty: z.number().min(0).max(1),
    heavyItemCount: z.number().min(0).max(1),
    distance: z.number().min(0).max(1),
  }),
  humanFollowupComplexityThreshold: z.number().min(0).max(100),
});

export type MoveComplexityConfig = z.infer<typeof moveComplexityConfigSchema>;

/**
 * PLACEHOLDER VALUES -- NOT CONFIRMED BY BLUE LINE. DO NOT SHIP TO
 * PRODUCTION AS-IS.
 *
 * These exist only so the engine's code can be written, exercised, and
 * unit-tested before real figures arrive. Every number below is a
 * plausible-looking guess, not a Blue Line operational fact -- treat this
 * file exactly like the pricing_config nulls for weekend%/GST: a tracked
 * gap, not a design decision. Flagged on the roadmap as a new Phase 0 item.
 */
export const placeholderMoveComplexityConfig: MoveComplexityConfig = {
  accessAdjustment: {
    stairsPerFlightMinutes: 10,
    longCarryMinutes: 15,
    restrictedParkingMinutes: 10,
  },
  specialHandling: {
    heavyItemMinutes: 15,
    packingRequiredMinutes: 30,
  },
  moveSizeThresholds: {
    smallMaxCubicVolume: 15,
    mediumMaxCubicVolume: 35,
  },
  complexityScoreWeights: {
    accessDifficulty: 0.4,
    heavyItemCount: 0.35,
    distance: 0.25,
  },
  humanFollowupComplexityThreshold: 70,
};
