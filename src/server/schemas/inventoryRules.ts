import { z } from "zod";

export const inventoryRuleSchema = z.object({
  itemCategory: z.string(),
  cubicVolume: z.number().positive(),
  handlingDifficulty: z.enum(["easy", "moderate", "difficult"]),
  moversRequired: z.number().int().positive(),
  loadingMinutes: z.number().nonnegative(),
  unloadingMinutes: z.number().nonnegative(),
});

export type InventoryRule = z.infer<typeof inventoryRuleSchema>;

/**
 * PLACEHOLDER VALUES -- NOT CONFIRMED BY BLUE LINE. See
 * moveComplexityConfig.ts for the same caveat. These per-item timings
 * (how long a crew takes to load/unload a sofa vs. a fridge vs. a box)
 * need to come from Blue Line's actual operational experience -- Qamira
 * has no basis to invent them. Enough categories are seeded here to
 * exercise the engine end-to-end; the real list and real numbers are a
 * Phase 0/1 input, not a Phase 2 build task.
 */
export const placeholderInventoryRules: InventoryRule[] = [
  { itemCategory: "box_small", cubicVolume: 0.15, handlingDifficulty: "easy", moversRequired: 1, loadingMinutes: 1, unloadingMinutes: 1 },
  { itemCategory: "box_large", cubicVolume: 0.3, handlingDifficulty: "easy", moversRequired: 1, loadingMinutes: 2, unloadingMinutes: 2 },
  { itemCategory: "sofa_2seat", cubicVolume: 2.5, handlingDifficulty: "moderate", moversRequired: 2, loadingMinutes: 8, unloadingMinutes: 6 },
  { itemCategory: "sofa_3seat", cubicVolume: 3.5, handlingDifficulty: "moderate", moversRequired: 2, loadingMinutes: 10, unloadingMinutes: 8 },
  { itemCategory: "bed_queen", cubicVolume: 3, handlingDifficulty: "moderate", moversRequired: 2, loadingMinutes: 12, unloadingMinutes: 10 },
  { itemCategory: "bed_single", cubicVolume: 1.8, handlingDifficulty: "easy", moversRequired: 2, loadingMinutes: 8, unloadingMinutes: 6 },
  { itemCategory: "fridge", cubicVolume: 2, handlingDifficulty: "difficult", moversRequired: 2, loadingMinutes: 12, unloadingMinutes: 10 },
  { itemCategory: "washing_machine", cubicVolume: 1, handlingDifficulty: "difficult", moversRequired: 2, loadingMinutes: 10, unloadingMinutes: 8 },
  { itemCategory: "dining_table", cubicVolume: 2, handlingDifficulty: "moderate", moversRequired: 2, loadingMinutes: 8, unloadingMinutes: 6 },
  { itemCategory: "wardrobe", cubicVolume: 3, handlingDifficulty: "difficult", moversRequired: 2, loadingMinutes: 12, unloadingMinutes: 10 },
  { itemCategory: "tv", cubicVolume: 0.5, handlingDifficulty: "moderate", moversRequired: 1, loadingMinutes: 5, unloadingMinutes: 5 },
  { itemCategory: "piano", cubicVolume: 3, handlingDifficulty: "difficult", moversRequired: 4, loadingMinutes: 45, unloadingMinutes: 45 },
  { itemCategory: "misc_furniture", cubicVolume: 1.5, handlingDifficulty: "moderate", moversRequired: 2, loadingMinutes: 6, unloadingMinutes: 5 },
];
