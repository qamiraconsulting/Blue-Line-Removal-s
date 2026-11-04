import type { HomeSizeId, MoverCount, RateCard, TruckId } from "./rateCard.js";

// The estimate engine: a PURE function -- inputs and a rate card in, one number out. No
// database, no network, no clock, no randomness, so the same inputs always give the same
// number and any historical estimate can be recomputed from what was stored with it.
//
// The customer sees ONE number (an estimate, GST included). Hourly rates, GST and the
// first-order discount all go into it; none of them is exposed. The only thing allowed to
// leave this module towards a customer is `customer` on a "price" outcome.

export type PropertySizeId = HomeSizeId | "commercial" | "unsure";

export interface LegDistance {
  km: number;
  minutes: number;
}

export interface QuoteInputs {
  need: "moving" | "junk";
  /** null = not given. */
  propertySize: PropertySizeId | null;
  /**
   * The customer's choice; null = use the home size guide's truck. "inspect" = the team
   * confirms the capacity at the move-day inspection -- estimated on the guide's truck/crew.
   */
  truck: TruckId | "inspect" | null;
  /** The customer's choice; null = use the home size guide's crew. */
  movers: MoverCount | null;
  /** yyyy-mm-dd. Needed because weekends and public holidays may cost more. */
  movingDate: string | null;
  /** The customer said this is their first order with Blue Line. */
  firstMoveRequested: boolean;
  /** Decided by the caller (e.g. no earlier discounted quote for this email/phone). */
  firstMoveEligible: boolean;
  access: {
    pickupStairFlights: number;
    dropoffStairFlights: number;
    /** The long carry applies at the pick-up / the drop-off (see longCarryAtEnd in service.ts). Charged once per end. */
    pickupLongCarry: boolean;
    dropoffLongCarry: boolean;
    heavyItems: number;
  };
  /** Piano, pool table, safe, etc. -- never auto-priced. */
  specialItems: boolean;
  /** Only used to check the service area -- the call-out is included in the hourly rate. */
  depotToPickup: LegDistance | null;
  pickupToDropoff: LegDistance | null;
}

export type ManualReason =
  | "junk_removal"
  | "size_missing"
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
  /** What the first-booking discount took off, before GST, dollars and cents -- as on the PDF quote (0 when none). */
  discountAud: number;
  validDays: number;
}

/** Stored with the quote for auditing; NEVER sent to a customer. */
export interface InternalBreakdown {
  truck: string;
  movers: number;
  /** Where the truck/crew came from: the customer's choice, the guide, or the guide pending the move-day inspection. */
  capacityFrom: "customer" | "guide" | "inspection";
  jobHours: number;
  crewRateAudPerHour: number;
  labourCostAud: number;
  accessCostAud: number;
  // The access extras one by one (2 Nov 2026: each is its own line on the quote). Absent on older quotes.
  stairFlights?: number;
  stairCostAud?: number;
  longCarryEnds?: number;
  longCarryCostAud?: number;
  heavyItems?: number;
  heavyCostAud?: number;
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
  if (!inputs.propertySize) return manual("size_missing");
  if (inputs.propertySize === "commercial" || inputs.propertySize === "unsure") return manual("commercial_or_unsure_size");
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

  const guide = rateCard.jobSizes[inputs.propertySize];
  if (!guide || rateCard.typicalHoursIncludeDriving === null) return manual("rate_card_incomplete");
  const inspect = inputs.truck === "inspect";
  const truckId = inputs.truck && inputs.truck !== "inspect" ? inputs.truck : guide.truck;
  const movers = inspect ? guide.movers : (inputs.movers ?? guide.movers);
  const truck = rateCard.trucks[truckId];
  if (truck.hourlyRateAud === null || rateCard.gst.ratesIncludeGst === null) return manual("rate_card_incomplete");

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

  const jobHours = chargedHours(guide.typicalHours, inputs.pickupToDropoff.minutes, rateCard);
  const crewRate = truck.hourlyRateAud + Math.max(0, movers - 2) * rateCard.extraMoverHourlyRateAud;
  return priceJob(
    {
      truck: truckId,
      movers,
      jobHours,
      crewRate,
      inspect,
      capacityFrom: inspect ? "inspection" : inputs.truck || inputs.movers ? "customer" : "guide",
      stairFlights: inputs.access.pickupStairFlights + inputs.access.dropoffStairFlights,
      longCarryEnds: (inputs.access.pickupLongCarry ? 1 : 0) + (inputs.access.dropoffLongCarry ? 1 : 0),
      heavyItems: inputs.access.heavyItems,
      surchargePercent,
      firstMoveApplied: inputs.firstMoveRequested && inputs.firstMoveEligible,
    },
    rateCard,
  );
}

/**
 * Charged from arrival at pickup to the end of unloading: the guide's typical hours, plus the
 * real drive between the addresses unless the guide already includes it -- never under the
 * minimum. Shared with the dashboard's Quick estimate.
 */
export function chargedHours(typicalHours: number, driveMinutes: number, rateCard: RateCard): number {
  const driveHours = rateCard.typicalHoursIncludeDriving ? 0 : driveMinutes / 60;
  return Math.max(rateCard.minimumJobHours, typicalHours + driveHours);
}

export interface PricedJob {
  truck: TruckId;
  movers: number;
  /** Charged hours: arrival at pickup to the end of unloading. */
  jobHours: number;
  /** AUD per hour for this truck and crew. */
  crewRate: number;
  inspect?: boolean;
  capacityFrom: InternalBreakdown["capacityFrom"];
  stairFlights: number;
  longCarryEnds: number;
  heavyItems: number;
  surchargePercent: number;
  firstMoveApplied: boolean;
}

/**
 * The price once the hours, crew and extras are known -- the chat, the website form, the
 * dashboard's Quick estimate and Matt's Google Form (via /api/intake "priceQuote") all price
 * here, so their totals always match.
 */
export function priceJob(job: PricedJob, rateCard: RateCard): Extract<QuoteOutcome, { kind: "price" }> {
  const truck = rateCard.trucks[job.truck];
  const { movers, jobHours, crewRate, inspect, stairFlights, longCarryEnds, surchargePercent, firstMoveApplied } = job;
  const labourCost = jobHours * crewRate;
  const stairCost = stairFlights * rateCard.accessExtras.perStairFlightAud;
  const longCarryCost = longCarryEnds * rateCard.accessExtras.longCarryAud;
  const heavyCost = job.heavyItems * rateCard.accessExtras.perHeavyItemAud;
  const accessCost = stairCost + longCarryCost + heavyCost;

  const charges = (labourCost + accessCost) * (1 + surchargePercent / 100);

  // First-order discount comes off the full subtotal EXCLUDING GST; GST is then added to
  // the discounted amount.
  const gstRate = rateCard.gst.ratePercent / 100;
  const subtotalExGst = rateCard.gst.ratesIncludeGst ? charges / (1 + gstRate) : charges;
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
        `${movers} movers and a ${truck.label}${inspect ? " (our team confirms what's needed on the day)" : ""}`,
        "Loading, transport and unloading",
        "GST included",
      ],
      firstMoveApplied,
      // The same discount line as the customer's PDF quote: before GST, in dollars and cents.
      discountAud: discountPercent > 0 ? customerFigures(amountAud, rateCard.gst.ratePercent, discountPercent).discount : 0,
      validDays: rateCard.validityDays,
    },
    internal: {
      truck: job.truck,
      movers,
      capacityFrom: job.capacityFrom,
      jobHours: round2(jobHours),
      crewRateAudPerHour: crewRate,
      labourCostAud: round2(labourCost),
      accessCostAud: accessCost,
      stairFlights,
      stairCostAud: round2(stairCost),
      longCarryEnds,
      longCarryCostAud: round2(longCarryCost),
      heavyItems: job.heavyItems,
      heavyCostAud: round2(heavyCost),
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

/**
 * What the customer's quote shows for a rounded total (Blue Line, 3 Nov): no rounding line --
 * the step to $10 is folded into the charges (the labour line) instead. So: subtotal + GST is
 * exactly the total, GST is exactly its percent of the subtotal, and the discount is exactly
 * its percent of the charges. The chat quotes this same discount.
 */
export function customerFigures(totalAud: number, gstPercent: number, discountPercent: number): { charges: number; discount: number; subtotal: number; gst: number } {
  const subtotal = round2((totalAud * 100) / (100 + gstPercent));
  const gst = round2(totalAud - subtotal);
  if (discountPercent <= 0) return { charges: subtotal, discount: 0, subtotal, gst };
  // charges - discount(charges) = subtotal. Rounding to cents can miss by a cent, so step a
  // few cents either side of the exact answer (one always fits: the left side only ever
  // grows by 0 or 1 cent per cent).
  const start = round2(subtotal / (1 - discountPercent / 100));
  for (let k = 0; k <= 20; k++) {
    for (const charges of [round2(start + k / 100), round2(start - k / 100)]) {
      const discount = round2((charges * discountPercent) / 100);
      if (round2(charges - discount) === subtotal) return { charges, discount, subtotal, gst };
    }
  }
  return { charges: start, discount: round2(start - subtotal), subtotal, gst };
}
