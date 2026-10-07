import type { MoverCount, RateCard, TruckId } from "./rateCard.js";

// The flat-price engine: a PURE function -- inputs and a rate card in, one price out. No
// database, no network, no clock, no randomness, so the same inputs always give the same
// number and any historical quote can be recomputed from what was stored with it.
//
// The customer sees ONE number. Hourly rates, the call-out cost, GST and the first-move
// discount all go into that number; none of them is exposed. The only thing allowed to
// leave this module towards a customer is `customer` on a "price" outcome.

/** The customer's capacity choice: a truck, or "inspect" (the team inspects and confirms). */
export type TruckChoice = TruckId | "inspect";

export interface LegDistance {
  km: number;
  minutes: number;
}

export interface QuoteInputs {
  need: "moving" | "junk";
  /** null = the customer didn't choose. */
  truck: TruckChoice | null;
  movers: MoverCount | null;
  /** yyyy-mm-dd. Needed because public holidays can cost more. */
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
  | "site_inspection_requested"
  | "capacity_missing"
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
  /** Charges excluding GST, before any discount. */
  subtotalAud: number;
  discountPercent: number;
  discountAud: number;
  gstAud: number;
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
  if (inputs.truck === "inspect") return manual("site_inspection_requested");
  if (!inputs.truck || !inputs.movers) return manual("capacity_missing");
  if (inputs.specialItems) return manual("special_items");
  if (!inputs.movingDate) return manual("date_missing");
  if (!inputs.depotToPickup || !inputs.pickupToDropoff) return manual("distance_unavailable");

  // Never guess a missing business rule -- any value this job needs that the card leaves
  // null means refuse and hand to a person.
  const { serviceArea } = rateCard;
  if (serviceArea.maxPickupFromDepotKm === null || serviceArea.maxMoveKm === null) return manual("rate_card_incomplete");
  if (inputs.depotToPickup.km > serviceArea.maxPickupFromDepotKm || inputs.pickupToDropoff.km > serviceArea.maxMoveKm) {
    return manual("outside_service_area");
  }

  const truck = rateCard.trucks[inputs.truck];
  const labourHours = truck.labourHours[String(inputs.movers) as "2" | "4"];
  if (truck.hourlyRateAud === null || labourHours == null) return manual("rate_card_incomplete");
  if (rateCard.gst.ratesIncludeGst === null) return manual("rate_card_incomplete");

  const holiday = rateCard.publicHolidays.includes(inputs.movingDate);
  const weekend = isWeekend(inputs.movingDate);
  if (holiday && rateCard.publicHolidaySurchargePercent === null) return manual("rate_card_incomplete");
  if (!holiday && weekend && rateCard.weekendSurchargePercent === null) return manual("rate_card_incomplete");
  // A public holiday on a weekend takes the holiday rate; the two never stack.
  const surchargePercent = holiday
    ? (rateCard.publicHolidaySurchargePercent ?? 0)
    : weekend
      ? (rateCard.weekendSurchargePercent ?? 0)
      : 0;

  // Loading/unloading plus the real drive between the two addresses, never below the minimum.
  const jobHours = Math.max(rateCard.minimumJobHours, labourHours + inputs.pickupToDropoff.minutes / 60);
  const extraMovers = Math.max(0, inputs.movers - 2);
  const crewRate = truck.hourlyRateAud + extraMovers * rateCard.extraMoverHourlyRateAud;
  const labourCost = jobHours * crewRate;

  const callOutHours = Math.max(rateCard.callOut.minimumHours, Math.ceil(inputs.depotToPickup.minutes / 60));
  const callOutCost = callOutHours * rateCard.callOut.ratePerHourAud;

  const stairFlights = inputs.access.pickupStairFlights + inputs.access.dropoffStairFlights;
  const accessCost =
    stairFlights * rateCard.accessExtras.perStairFlightAud +
    (inputs.access.longCarry ? rateCard.accessExtras.longCarryAud : 0) +
    inputs.access.heavyItems * rateCard.accessExtras.perHeavyItemAud;

  const charges = (labourCost + callOutCost + accessCost) * (1 + surchargePercent / 100);

  // The first-move offer comes off the charges EXCLUDING GST; GST is then charged on the
  // discounted price (GST is always 10% of what the customer actually pays).
  const gstRate = rateCard.gst.ratePercent / 100;
  const subtotalExGst = rateCard.gst.ratesIncludeGst ? charges / (1 + gstRate) : charges;
  const firstMoveApplied = inputs.firstMoveRequested && inputs.firstMoveEligible;
  const discountPercent = firstMoveApplied ? rateCard.firstMoveDiscountPercent : 0;
  const discount = subtotalExGst * (discountPercent / 100);
  const gst = (subtotalExGst - discount) * gstRate;
  const unrounded = subtotalExGst - discount + gst;

  const step = rateCard.roundToNearestAud;
  const amountAud = Math.round(unrounded / step) * step;

  return {
    kind: "price",
    amountAud,
    customer: {
      amountAud,
      includes: [
        `${inputs.movers} movers and a ${truck.label}`,
        "Loading, transport and unloading",
        "Travel to your pickup address and between addresses",
        "GST included",
      ],
      firstMoveApplied,
      validDays: rateCard.validityDays,
    },
    internal: {
      truck: inputs.truck,
      movers: inputs.movers,
      jobHours: round2(jobHours),
      crewRateAudPerHour: crewRate,
      labourCostAud: round2(labourCost),
      callOutHours,
      callOutCostAud: callOutCost,
      accessCostAud: accessCost,
      surchargeAppliedPercent: surchargePercent,
      subtotalAud: round2(subtotalExGst),
      discountPercent,
      discountAud: round2(discount),
      gstAud: round2(gst),
      unroundedAud: round2(unrounded),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
