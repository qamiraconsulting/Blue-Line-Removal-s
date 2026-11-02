import type { InternalBreakdown } from "../quote/calculateQuote.js";
import { moverCounts, truckIds, type RateCard, type TruckId } from "../quote/rateCard.js";

// The breakdown printed on the branded PDF quote ("Your estimate" table): the same lines as
// Matt's Google Sheet quotes -- rate per hour x hours = labour, call-out, packing, stairs, then
// subtotal, GST and total. Ayesha (2026-10-15): website and chat customers get the full
// breakdown too.
//
// The lines ALWAYS add up to the total the customer is charged. Blue Line's feedback (2 Nov):
// each extra is its own line -- stairs (real flights), long carry ("2 x $40") and heavy items --
// the first-booking discount is exactly its percent of the charges, and rounding the total to
// $10 shows as its own "Rounding" line after GST instead of hiding inside the discount. Only a
// total the team typed in by hand still goes on an "Adjustment" line (their note says why).

export interface QuoteLines {
  truck: TruckId | null;
  movers: number | null;
  hours: number | null;
  rateHr: number | null;
  stairFlights: number;
  labour: number;
  callOut: number;
  packing: number;
  /** Stairs only (flights x the per-flight price). Older quotes folded every access extra in here. */
  stair: number;
  /** Long carry: ends charged and the charge (2 Nov 2026; absent on older quotes). */
  longCarryEnds?: number;
  longCarry?: number;
  /** Heavy items: how many and the charge (2 Nov 2026; absent on older quotes). */
  heavyCount?: number;
  heavy?: number;
  /** First-booking discount: a positive amount, shown as minus -- exactly discountPercent of the charges. */
  discount?: number;
  discountPercent?: number;
  /** What the team's own total adds or takes away (0 when the price wasn't typed in). */
  adjustment: number;
  /** Excluding GST, after the discount. */
  subtotal: number;
  gst: number;
  /** Rounding the GST-included total to the rate card's step ($10). */
  rounding?: number;
  /** GST included -- the amount the customer pays. */
  total: number;
  services: string;
}

type LineBase = Omit<QuoteLines, "adjustment" | "subtotal" | "gst" | "total" | "rounding">;

const round2 = (n: number) => Math.round(n * 100) / 100;
const zeroed = (n: number) => (Math.abs(n) < 0.005 ? 0 : n);

/** Everything charged before the discount, excluding GST. */
export const chargesOf = (b: LineBase) => round2(b.labour + b.callOut + b.packing + b.stair + (b.longCarry ?? 0) + (b.heavy ?? 0));

/**
 * A total from elsewhere (the team's typed total, Matt's sheet): split it into subtotal + GST and
 * put whatever the lines (less any discount) don't explain on the adjustment line.
 */
export function finishLines(base: LineBase, total: number, gstPercent: number): QuoteLines {
  const gst = round2((total * gstPercent) / (100 + gstPercent));
  const subtotal = round2(total - gst);
  const adjustment = zeroed(round2(subtotal - (chargesOf(base) - (base.discount ?? 0))));
  return { ...base, adjustment, subtotal, gst, total };
}

/** A total the rate card worked out: subtotal and GST exactly, and the step to $10 on its own line. */
export function finishRounded(base: LineBase, total: number, gstPercent: number): QuoteLines {
  const subtotal = round2(chargesOf(base) - (base.discount ?? 0));
  const gst = round2((subtotal * gstPercent) / 100);
  return { ...base, adjustment: 0, subtotal, gst, rounding: zeroed(round2(total - subtotal - gst)), total };
}

const discountFor = (charges: number, percent: number) => (percent > 0 ? { discount: round2((charges * percent) / 100), discountPercent: percent } : {});

/** The instant estimate's breakdown, as stored with the quote. */
export function linesFromEstimate(internal: InternalBreakdown, total: number, rateCard: Pick<RateCard, "gst">): QuoteLines {
  const head = {
    truck: (truckIds as readonly string[]).includes(internal.truck) ? (internal.truck as TruckId) : null,
    movers: internal.movers,
    hours: internal.jobHours,
    rateHr: internal.crewRateAudPerHour,
    labour: round2(internal.labourCostAud),
    callOut: 0, // never charged by the chat or the website (Ayesha's manager, 28 Oct)
    packing: 0,
    services: "Standard Move",
  };
  // Quotes made before 2 Nov only kept the access extras as one figure.
  if (internal.stairCostAud === undefined) {
    return finishLines({ ...head, stairFlights: 0, stair: round2(internal.accessCostAud) }, total, rateCard.gst.ratePercent);
  }
  const base: LineBase = {
    ...head,
    stairFlights: internal.stairFlights ?? 0,
    stair: round2(internal.stairCostAud),
    longCarryEnds: internal.longCarryEnds ?? 0,
    longCarry: round2(internal.longCarryCostAud ?? 0),
    heavyCount: internal.heavyItems ?? 0,
    heavy: round2(internal.heavyCostAud ?? 0),
  };
  return finishRounded({ ...base, ...discountFor(chargesOf(base), internal.discountPercent) }, total, rateCard.gst.ratePercent);
}

export interface TeamQuoteInput {
  truck: TruckId | null;
  movers: number | null;
  hours: number | null;
  stairFlights: number;
  /** Ends where the long carry applies (0-2). */
  longCarryEnds?: number;
  heavyCount?: number;
  packingAud: number;
  /** Keep the first-order discount the customer was given. */
  firstMoveApplied: boolean;
  services?: string;
  /** The team's own total (GST included). Wins over the recalculated one. */
  overrideTotal: number | null;
}

export type TeamQuoteResult = { ok: true; lines: QuoteLines; calculatedTotal: number | null } | { ok: false; error: string };

/**
 * The dashboard's "edit before sending": works the price out again from the truck, crew, hours
 * and extras with the same rate card -- and/or takes the team's own total. Surcharges aren't
 * applied here (still unconfirmed); the team adds one through the total and explains it.
 */
export function teamQuote(input: TeamQuoteInput, rateCard: RateCard): TeamQuoteResult {
  const services = input.services?.trim() || "Standard Move";
  const canCalculate = input.truck !== null && input.movers !== null && input.hours !== null;
  const extras = {
    stairFlights: input.stairFlights,
    stair: round2(input.stairFlights * rateCard.accessExtras.perStairFlightAud),
    longCarryEnds: input.longCarryEnds ?? 0,
    longCarry: round2((input.longCarryEnds ?? 0) * rateCard.accessExtras.longCarryAud),
    heavyCount: input.heavyCount ?? 0,
    heavy: round2((input.heavyCount ?? 0) * rateCard.accessExtras.perHeavyItemAud),
  };
  const percent = input.firstMoveApplied ? rateCard.firstMoveDiscountPercent : 0;

  if (!canCalculate) {
    if (input.overrideTotal === null) return { ok: false, error: "Enter the truck, movers and hours, or type the total." };
    const base: LineBase = { truck: input.truck, movers: input.movers, hours: input.hours, rateHr: null, labour: 0, callOut: 0, packing: round2(input.packingAud), services, ...extras };
    return { ok: true, calculatedTotal: null, lines: finishLines({ ...base, ...discountFor(chargesOf(base), percent) }, input.overrideTotal, rateCard.gst.ratePercent) };
  }

  const truck = rateCard.trucks[input.truck!];
  if (!(moverCounts as readonly number[]).includes(input.movers!) || truck.hourlyRateAud === null) {
    if (input.overrideTotal === null) return { ok: false, error: "That truck or crew has no rate in the price list -- type the total instead." };
  }
  const rateHr = (truck.hourlyRateAud ?? 0) + Math.max(0, input.movers! - 2) * rateCard.extraMoverHourlyRateAud;
  const hours = Math.max(rateCard.minimumJobHours, input.hours!);
  const base: LineBase = {
    truck: input.truck,
    movers: input.movers,
    hours,
    rateHr: truck.hourlyRateAud === null ? null : rateHr,
    labour: round2(rateHr * hours),
    callOut: 0,
    packing: round2(input.packingAud),
    services,
    ...extras,
  };
  const withDiscount = { ...base, ...discountFor(chargesOf(base), percent) };
  const withGst = (chargesOf(base) - (withDiscount.discount ?? 0)) * (1 + rateCard.gst.ratePercent / 100);
  const calculatedTotal = Math.round(withGst / rateCard.roundToNearestAud) * rateCard.roundToNearestAud;

  return {
    ok: true,
    calculatedTotal: truck.hourlyRateAud === null ? null : calculatedTotal,
    lines:
      input.overrideTotal !== null
        ? finishLines(withDiscount, input.overrideTotal, rateCard.gst.ratePercent)
        : finishRounded(withDiscount, calculatedTotal, rateCard.gst.ratePercent),
  };
}
