import type { PricingConfigRules } from "@/server/schemas/pricingConfig";

// Pricing Engine -- architecture doc Section 9. Fully separate from the
// Move Complexity Engine: this consumes its output, it doesn't recompute
// duration. The LLM's system prompt states it may only ever quote a dollar
// figure that came back from this function's output -- this is the
// structural half of that guarantee (the response-layer regex check from
// Section 9 is the second line of defence, not the only one).

export class PricingConfigIncompleteError extends Error {
  constructor(missingField: string) {
    super(
      `Pricing config is missing "${missingField}" -- this is a real gap pending Blue Line's confirmation ` +
        `(see the roadmap's Phase 0 checklist), not something the engine may assume a value for. ` +
        `Refusing to produce a customer-facing price until it's set.`,
    );
    this.name = "PricingConfigIncompleteError";
  }
}

export interface CallOutFeeInput {
  travelMinutes: number; // from calculate_route(truckLastLocation -> pickupAddress)
}

export interface CallOutFeeResult {
  callOutFeeAud: number;
  billedHours: number;
  noExtraTravelCharge: boolean; // true when billedHours === minimumHours -- the honest proximity-hook flag
}

// max(1, ceil(travel_hours)) x ratePerHourAud -- confirmed 2026-08-21.
export function calculateCallOutFee(input: CallOutFeeInput, config: PricingConfigRules["callOut"]): CallOutFeeResult {
  const travelHours = input.travelMinutes / 60;
  const billedHours = Math.max(config.minimumHours, Math.ceil(travelHours));
  const callOutFeeAud = billedHours * config.ratePerHourAud;
  return {
    callOutFeeAud,
    billedHours,
    noExtraTravelCharge: billedHours <= config.minimumHours,
  };
}

export interface PriceCalculationInput {
  truckTierId: string;
  crewSize: number;
  durationMinutes: number; // from the Move Complexity Engine
  movingDate: string; // ISO date -- used only to check the (currently unconfirmed) weekend/holiday flag
  isWeekendOrPublicHoliday: boolean;
  stairsFlights: number;
  heavyItemCount: number;
  pianoMoving: boolean;
  longCarry: boolean;
  packingRequired: boolean;
  callOutTravelMinutes: number;
}

export interface AdditionalCharge {
  label: string;
  amountAud: number;
}

export interface PriceCalculationOutput {
  currency: "AUD";
  basePriceMinAud: number;
  basePriceMaxAud: number;
  additionalCharges: AdditionalCharge[];
  callOutFeeAud: number;
  noExtraTravelCharge: boolean;
  estimatedMinAud: number;
  estimatedMaxAud: number;
  minimumChargeAud: number;
  gstIncluded: boolean;
  assumptions: string[];
  status: "estimate";
}

export function calculatePrice(input: PriceCalculationInput, config: PricingConfigRules): PriceCalculationOutput {
  if (config.gstMode === null) throw new PricingConfigIncompleteError("gstMode");
  if (input.isWeekendOrPublicHoliday && config.weekendHolidaySurchargePercent === null) {
    throw new PricingConfigIncompleteError("weekendHolidaySurchargePercent");
  }

  const tier = config.truckTiers.find((t) => t.id === input.truckTierId);
  if (!tier) {
    throw new Error(`Unknown truck tier "${input.truckTierId}" -- not present in the active pricing config.`);
  }

  const billableHours = Math.max(config.minimumBookingHours, input.durationMinutes / 60);
  const extraMovers = Math.max(0, input.crewSize - tier.baseCrewSize);

  let basePriceMinAud = billableHours * tier.hourlyRateAudMin;
  let basePriceMaxAud = billableHours * tier.hourlyRateAudMax;
  const extraMoverCostAud = extraMovers * config.additionalMoverHourlyRateAud * billableHours;
  basePriceMinAud += extraMoverCostAud;
  basePriceMaxAud += extraMoverCostAud;

  const assumptions: string[] = ["Estimate assumes standard access at both addresses unless noted below."];

  if (input.isWeekendOrPublicHoliday && config.weekendHolidaySurchargePercent) {
    const multiplier = 1 + config.weekendHolidaySurchargePercent / 100;
    basePriceMinAud *= multiplier;
    basePriceMaxAud *= multiplier;
    assumptions.push(`Includes the ${config.weekendHolidaySurchargePercent}% weekend/public holiday rate.`);
  }

  const additionalCharges: AdditionalCharge[] = [];
  if (input.stairsFlights > 0) {
    additionalCharges.push({
      label: `Stairs (${input.stairsFlights} flight${input.stairsFlights > 1 ? "s" : ""})`,
      amountAud: input.stairsFlights * config.additionalCharges.stairsPerFlightAud,
    });
  }
  if (input.heavyItemCount > 0) {
    additionalCharges.push({
      label: "Heavy item surcharge",
      amountAud: input.heavyItemCount * config.additionalCharges.heavyItemSurchargeAud,
    });
  }
  if (input.pianoMoving) {
    additionalCharges.push({ label: "Piano moving (from)", amountAud: config.additionalCharges.pianoMovingFromAud });
  }
  if (input.longCarry) {
    additionalCharges.push({ label: "Long carry", amountAud: config.additionalCharges.longCarryAud });
  }

  const { callOutFeeAud, noExtraTravelCharge } = calculateCallOutFee(
    { travelMinutes: input.callOutTravelMinutes },
    config.callOut,
  );

  const additionalChargesTotal = additionalCharges.reduce((sum, c) => sum + c.amountAud, 0);
  let estimatedMinAud = basePriceMinAud + additionalChargesTotal + callOutFeeAud;
  let estimatedMaxAud = basePriceMaxAud + additionalChargesTotal + callOutFeeAud;

  if (config.gstMode === "exclusive") {
    const gstMultiplier = 1 + config.gstRatePercent / 100;
    estimatedMinAud *= gstMultiplier;
    estimatedMaxAud *= gstMultiplier;
    assumptions.push(`Prices include ${config.gstRatePercent}% GST, added to the base rate card figures.`);
  } else {
    assumptions.push(`Prices are GST-inclusive.`);
  }

  assumptions.push("Final price confirmed after inventory review, in your booking confirmation email.");
  if (noExtraTravelCharge) {
    assumptions.push("No extra travel charge -- our truck will already be in your area that day.");
  }

  const minimumChargeAud = config.minimumBookingHours * tier.hourlyRateAudMin + callOutFeeAud;

  return {
    currency: "AUD",
    basePriceMinAud: Math.round(basePriceMinAud),
    basePriceMaxAud: Math.round(basePriceMaxAud),
    additionalCharges,
    callOutFeeAud,
    noExtraTravelCharge,
    estimatedMinAud: Math.round(estimatedMinAud),
    estimatedMaxAud: Math.round(estimatedMaxAud),
    minimumChargeAud: Math.round(minimumChargeAud),
    gstIncluded: true,
    assumptions,
    status: "estimate",
  };
}
