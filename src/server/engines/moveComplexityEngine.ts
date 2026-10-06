import type { MoveComplexityConfig } from "../schemas/moveComplexityConfig.js";
import type { InventoryRule } from "../schemas/inventoryRules.js";

// Move Complexity Engine -- architecture doc Section 8. Deterministic,
// config-driven, never touched by the LLM. The model calls
// calculate_move_estimate (see src/server/tools) which invokes this and
// hands back only the output shape below; it never sees or influences the
// coefficients.

export interface InventoryItemInput {
  itemCategory: string;
  quantity: number;
  heavyItem?: boolean;
}

export interface MoveComplexityInput {
  inventory: InventoryItemInput[];
  distanceKm: number;
  travelMinutes: number; // from calculate_route(), never estimated here
  pickupFloor: number;
  pickupLift: boolean;
  pickupStairs: boolean;
  destinationFloor: number;
  destinationLift: boolean;
  destinationStairs: boolean;
  longCarry: boolean;
  restrictedParking: boolean;
  packingRequired: boolean;
}

export interface MoveComplexityOutput {
  moveSize: "small" | "medium" | "large";
  recommendedTruckTierId: string; // matches pricingConfig truckTiers[].id
  recommendedMovers: number;
  estimatedLoadingMinutes: number;
  estimatedUnloadingMinutes: number;
  estimatedTravelMinutes: number;
  estimatedDurationMinutes: number;
  totalCubicVolume: number;
  moveComplexityScore: number; // 0-100, internal triage only -- never shown to the customer
  heavyItemCount: number;
}

function findRule(inventoryRules: InventoryRule[], category: string): InventoryRule | undefined {
  return inventoryRules.find((r) => r.itemCategory === category);
}

function flightsOfStairs(floor: number, hasLift: boolean): number {
  // A floor with a lift doesn't cost stair-climbing time even if it's
  // several storeys up. Ground floor (0) never counts as a flight.
  if (hasLift || floor <= 0) return 0;
  return floor;
}

export function calculateMoveComplexity(
  input: MoveComplexityInput,
  inventoryRules: InventoryRule[],
  config: MoveComplexityConfig,
): MoveComplexityOutput {
  let loadingMinutes = 0;
  let unloadingMinutes = 0;
  let totalCubicVolume = 0;
  let heavyItemCount = 0;
  let maxMoversRequired = 2; // floor of 2, per Section 8

  for (const item of input.inventory) {
    const rule = findRule(inventoryRules, item.itemCategory);
    if (!rule) continue; // unrecognised category -- surfaced by the caller for human review, not silently dropped
    loadingMinutes += rule.loadingMinutes * item.quantity;
    unloadingMinutes += rule.unloadingMinutes * item.quantity;
    totalCubicVolume += rule.cubicVolume * item.quantity;
    maxMoversRequired = Math.max(maxMoversRequired, rule.moversRequired);
    if (item.heavyItem) heavyItemCount += item.quantity;
  }

  const pickupStairFlights = flightsOfStairs(input.pickupFloor, input.pickupLift);
  const destinationStairFlights = flightsOfStairs(input.destinationFloor, input.destinationLift);
  const stairsAdjustment =
    (pickupStairFlights + destinationStairFlights) * config.accessAdjustment.stairsPerFlightMinutes;
  const longCarryAdjustment = input.longCarry ? config.accessAdjustment.longCarryMinutes : 0;
  const restrictedParkingAdjustment = input.restrictedParking
    ? config.accessAdjustment.restrictedParkingMinutes
    : 0;
  const heavyItemAdjustment = heavyItemCount * config.specialHandling.heavyItemMinutes;
  const packingAdjustment = input.packingRequired ? config.specialHandling.packingRequiredMinutes : 0;

  const accessAndHandlingMinutes =
    stairsAdjustment + longCarryAdjustment + restrictedParkingAdjustment + heavyItemAdjustment + packingAdjustment;

  const estimatedDurationMinutes = Math.round(
    loadingMinutes + input.travelMinutes + unloadingMinutes + accessAndHandlingMinutes,
  );

  const moveSize: MoveComplexityOutput["moveSize"] =
    totalCubicVolume <= config.moveSizeThresholds.smallMaxCubicVolume
      ? "small"
      : totalCubicVolume <= config.moveSizeThresholds.mediumMaxCubicVolume
        ? "medium"
        : "large";

  const recommendedTruckTierId = moveSize === "small" ? "4.5T" : moveSize === "medium" ? "6-8T" : "11T";

  // 0-100 composite score, each factor normalised before weighting.
  // Internal triage only -- see Section 8's own note that this is never
  // surfaced to the customer as a number.
  const accessDifficultyNorm = Math.min(1, (pickupStairFlights + destinationStairFlights) / 6);
  const heavyItemNorm = Math.min(1, heavyItemCount / 5);
  const distanceNorm = Math.min(1, input.distanceKm / 100);
  const moveComplexityScore = Math.round(
    (accessDifficultyNorm * config.complexityScoreWeights.accessDifficulty +
      heavyItemNorm * config.complexityScoreWeights.heavyItemCount +
      distanceNorm * config.complexityScoreWeights.distance) *
      100,
  );

  return {
    moveSize,
    recommendedTruckTierId,
    recommendedMovers: maxMoversRequired,
    estimatedLoadingMinutes: Math.round(loadingMinutes),
    estimatedUnloadingMinutes: Math.round(unloadingMinutes),
    estimatedTravelMinutes: input.travelMinutes,
    estimatedDurationMinutes,
    totalCubicVolume: Math.round(totalCubicVolume * 100) / 100,
    moveComplexityScore,
    heavyItemCount,
  };
}

export function requiresHumanFollowup(
  output: MoveComplexityOutput,
  config: MoveComplexityConfig,
  specialItemsNoted: boolean,
): boolean {
  // Per the playbook: piano/special items always escalate, regardless of
  // the computed score. The score threshold is the second, independent
  // trigger for jobs that are merely complex without a named special item.
  return specialItemsNoted || output.moveComplexityScore >= config.humanFollowupComplexityThreshold;
}
