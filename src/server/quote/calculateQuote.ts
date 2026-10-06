import type { JobSizeId, RateCard } from "./rateCard.js";

// The flat-price engine: a PURE function -- inputs and a rate card in, one price out. No
// database, no network, no clock, no randomness, so the same inputs always give the same
// number and any historical quote can be recomputed from what was stored with it.
//
// The customer sees ONE number. Hourly rates, the call-out cost, GST and the first-move
// discount all go into that number; none of them is exposed. The only thing allowed to
// leave this module towards a customer is `customer` on a "price" outcome.

export type PropertySizeId = JobSizeId | "commercial" | "unsure";

export interface LegDistance {
  km: number;
  minutes: number;
}

export interface QuoteInputs {
  need: "moving" | "junk";
  propertySize: PropertySizeId;
  /** yyyy-mm-dd. Needed because weekends/public holidays can cost more. */
  movingDate: string | null;
  /** The customer ticked "this is my first move". */
  firstMoveRequested: boolean;
  /** Decided by the caller (e.g. no earlier discounted quote for this email/phone). */
  firstMoveEligible: boolean;
  access: {
    pickupStairFlights: number;
    dropoffStairFlights: number;
    longCarry: boolean;
    heavyItems: number;
  };
  /** Piano, pool table, safe, etc. -- never auto-priced. */
  specialItems: boolean;
  depotToPickup: LegDistance | null;
  pickupToDropoff: LegDistance | null;
}

export type ManualReason =
  | "junk_removal"
  | "commercial_or_unsure_size"
  | "special_items"
  | "date_missing"
  | "distance_unavailable"
  | "outside_service_area"
  | "rate_card_not_confirmed"
  | "rate_card_incomplete";

export interface CustomerQuoteView {
  amountAud: number;
  /** Plain-language inclusions. Never contains a rate. */
  includes: string[];
  firstMoveApplied: boolean;
  validDays: number;
}

/** Stored with the quote for auditing; NEVER sent to a customer. */
export interface InternalBreakdown {
  truck: string;
  movers: number;
  jobHours: number;
  crewRateAudPerHour: number;
  labourCostAud: number;
  callOutHours: number;
  callOutCostAud: number;
  accessCostAud: number;
  surchargeAppliedPercent: number;
  subtotalAud: number;
  totalIncGstAud: number;
  discountPercent: number;
  unroundedAud: number;
}

export type QuoteOutcome =
  | { kind: "price"; amountAud: number; customer: CustomerQuoteView; internal: InternalBreakdown }
  | { kind: "manual"; reason: ManualReason };

export interface CalculateOptions {
  /** Dev/testing only. Production must leave this false so placeholder cards never quote. */
  allowPlaceholderRateCard?: boolean;
}

// Calendar-date weekday without time-zone drift: Date.UTC on the parsed parts.
function isWeekend(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

const manual = (reason: ManualReason): QuoteOutcome => ({ kind: "manual", reason });

export function calculateQuote(inputs: QuoteInputs, rateCard: RateCard, options: CalculateOptions = {}): QuoteOutcome {
  if (rateCard.status !== "confirmed" && !options.allowPlaceholderRateCard) return manual("rate_card_not_confirmed");

  if (inputs.need === "junk") return manual("junk_removal");
  if (inputs.propertySize === "commercial" || inputs.propertySize === "unsure") return manual("commercial_or_unsure_size");
  if (inputs.specialItems) return manual("special_items");
  if (!inputs.movingDate) return manual("date_missing");
  if (!inputs.depotToPickup || !inputs.pickupToDropoff) return manual("distance_unavailable");

  const { serviceArea } = rateCard;
  if (inputs.depotToPickup.km > serviceArea.maxPickupFromDepotKm || inputs.pickupToDropoff.km > serviceArea.maxMoveKm) {
    return manual("outside_service_area");
  }

  // Never guess a missing business rule -- refuse and hand to a person.
  if (rateCard.gst.ratesIncludeGst === null) return manual("rate_card_incomplete");
  const surcharged = isWeekend(inputs.movingDate) || rateCard.publicHolidays.includes(inputs.movingDate);
  if (surcharged && rateCard.weekendHolidaySurchargePercent === null) return manual("rate_card_incomplete");

  const job = rateCard.jobSizes[inputs.propertySize];
  const truck = rateCard.trucks[job.truck];

  // Labour hours plus the real drive between the two addresses, never below the minimum.
  const jobHours = Math.max(rateCard.minimumJobHours, job.labourHours + inputs.pickupToDropoff.minutes / 60);
  const extraMovers = Math.max(0, job.movers - 2);
  const crewRate = truck.hourlyRateAud + extraMovers * rateCard.extraMoverHourlyRateAud;
  const labourCost = jobHours * crewRate;

  const callOutHours = Math.max(rateCard.callOut.minimumHours, Math.ceil(inputs.depotToPickup.minutes / 60));
  const callOutCost = callOutHours * rateCard.callOut.ratePerHourAud;

  const stairFlights = inputs.access.pickupStairFlights + inputs.access.dropoffStairFlights;
  const accessCost =
    stairFlights * rateCard.accessExtras.perStairFlightAud +
    (inputs.access.longCarry ? rateCard.accessExtras.longCarryAud : 0) +
    inputs.access.heavyItems * rateCard.accessExtras.perHeavyItemAud;

  const surchargePercent = surcharged ? (rateCard.weekendHolidaySurchargePercent ?? 0) : 0;
  const subtotal = (labourCost + callOutCost + accessCost) * (1 + surchargePercent / 100);

  // The single price shown to customers is GST-inclusive. If the card's rates are ex-GST, add it here.
  const totalIncGst = rateCard.gst.ratesIncludeGst ? subtotal : subtotal * (1 + rateCard.gst.ratePercent / 100);

  const firstMoveApplied = inputs.firstMoveRequested && inputs.firstMoveEligible;
  const discountPercent = firstMoveApplied ? rateCard.firstMoveDiscountPercent : 0;
  const unrounded = totalIncGst * (1 - discountPercent / 100);

  const step = rateCard.roundToNearestAud;
  const amountAud = Math.round(unrounded / step) * step;

  return {
    kind: "price",
    amountAud,
    customer: {
      amountAud,
      includes: [
        `${job.movers} movers and a ${truck.label}`,
        "Loading, transport and unloading",
        "Travel to your pickup address and between addresses",
        "GST included",
      ],
      firstMoveApplied,
      validDays: rateCard.validityDays,
    },
    internal: {
      truck: job.truck,
      movers: job.movers,
      jobHours: round2(jobHours),
      crewRateAudPerHour: crewRate,
      labourCostAud: round2(labourCost),
      callOutHours,
      callOutCostAud: callOutCost,
      accessCostAud: accessCost,
      surchargeAppliedPercent: surchargePercent,
      subtotalAud: round2(subtotal),
      totalIncGstAud: round2(totalIncGst),
      discountPercent,
      unroundedAud: round2(unrounded),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
