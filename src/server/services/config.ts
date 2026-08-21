import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { inventoryRules as inventoryRulesTable, pricingConfig } from "@/server/db/schema";
import { pricingConfigRulesSchema, seedPricingConfigRules, type PricingConfigRules } from "@/server/schemas/pricingConfig";
import { placeholderMoveComplexityConfig, type MoveComplexityConfig } from "@/server/schemas/moveComplexityConfig";
import { placeholderInventoryRules, type InventoryRule } from "@/server/schemas/inventoryRules";

// Reads the active, versioned pricing_config row from the database. Falls
// back to the in-code seed only when no row exists yet (i.e. before the
// database has been seeded) -- once seeded, the database row is always
// authoritative, since Blue Line editing rates should never require a
// redeploy.
export async function getActivePricingConfig(): Promise<{
  pricing: PricingConfigRules;
  moveComplexity: MoveComplexityConfig;
}> {
  const db = getDb();
  const [active] = await db
    .select()
    .from(pricingConfig)
    .where(eq(pricingConfig.active, true))
    .orderBy(desc(pricingConfig.effectiveFrom))
    .limit(1);

  const pricing = active ? pricingConfigRulesSchema.parse(active.rules) : seedPricingConfigRules;

  // moveComplexityConfig has no database table yet (Phase 1 scope note --
  // it's a small, low-churn config, so a DB table is a Phase 3+ nicety, not
  // a blocker). The placeholder values here are the same "not confirmed by
  // Blue Line" gap flagged in moveComplexityConfig.ts.
  return { pricing, moveComplexity: placeholderMoveComplexityConfig };
}

export async function getInventoryRules(): Promise<InventoryRule[]> {
  const db = getDb();
  const rows = await db.select().from(inventoryRulesTable);
  if (rows.length === 0) return placeholderInventoryRules;

  return rows.map((r) => ({
    itemCategory: r.itemCategory,
    cubicVolume: Number(r.cubicVolume),
    handlingDifficulty: r.handlingDifficulty as InventoryRule["handlingDifficulty"],
    moversRequired: r.moversRequired,
    loadingMinutes: r.loadingMinutes,
    unloadingMinutes: r.unloadingMinutes,
  }));
}
