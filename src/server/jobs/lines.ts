import type { InternalBreakdown } from "../quote/calculateQuote.js";
import { moverCounts, truckIds, type RateCard, type TruckId } from "../quote/rateCard.js";

// The breakdown printed on the branded PDF quote ("Your estimate" table): the same lines as
// Matt's Google Sheet quotes -- rate per hour x hours = labour, call-out, packing, stairs, then
// subtotal, GST and total. Ayesha (2026-10-15): website and chat customers get the full
// breakdown too.
//
// The lines ALWAYS add up to the total the customer is charged. Whatever the plain lines
// don't explain -- the first-order discount, rounding to $10, a weekend surcharge, or a total
// the team typed in by hand -- goes on one "Discount / adjustment" line, and the team's note
// tells the customer why.

export interface QuoteLines {
  truck: TruckId | null;
  movers: number | null;
  hours: number | null;
  rateHr: number | null;
  stairFlights: number;
  labour: number;
  callOut: number;
  packing: number;
  stair: number;
  adjustment: number;
  /** Excluding GST. */
  subtotal: number;
  gst: number;
  /** GST included -- the amount the customer pays. */
  total: number;
  services: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Splits `total` (GST included) into subtotal + GST and puts the difference on the adjustment line. */
export function finishLines(
  base: Omit<QuoteLines, "adjustment" | "subtotal" | "gst" | "total">,
  total: number,
  gstPercent: number,
): QuoteLines {
  const gst = round2((total * gstPercent) / (100 + gstPercent));
  const subtotal = round2(total - gst);
  const adjustment = round2(subtotal - (base.labour + base.callOut + base.packing + base.stair));
  return { ...base, adjustment: Math.abs(adjustment) < 0.005 ? 0 : adjustment, subtotal, gst, total };
}

/** The instant estimate's breakdown, as stored with the quote. */
export function linesFromEstimate(internal: InternalBreakdown, total: number, rateCard: Pick<RateCard, "gst">): QuoteLines {
  return finishLines(
    {
      truck: (truckIds as readonly string[]).includes(internal.truck) ? (internal.truck as TruckId) : null,
      movers: internal.movers,
      hours: internal.jobHours,
      rateHr: internal.crewRateAudPerHour,
      stairFlights: 0,
      labour: round2(internal.labourCostAud),
      callOut: 0, // included in the hourly rate (rate card, 12 Oct email)
      packing: 0,
      stair: round2(internal.accessCostAud),
      services: "Standard Move",
    },
    total,
    rateCard.gst.ratePercent,
  );
}

export interface TeamQuoteInput {
  truck: TruckId | null;
  movers: number | null;
  hours: number | null;
  stairFlights: number;
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

  if (!canCalculate) {
    if (input.overrideTotal === null) return { ok: false, error: "Enter the truck, movers and hours, or type the total." };
    return {
      ok: true,
      calculatedTotal: null,
      lines: finishLines(
        { truck: input.truck, movers: input.movers, hours: input.hours, rateHr: null, stairFlights: input.stairFlights, labour: 0, callOut: 0, packing: round2(input.packingAud), stair: 0, services },
        input.overrideTotal,
        rateCard.gst.ratePercent,
      ),
    };
  }

  const truck = rateCard.trucks[input.truck!];
  if (!(moverCounts as readonly number[]).includes(input.movers!) || truck.hourlyRateAud === null) {
    if (input.overrideTotal === null) return { ok: false, error: "That truck or crew has no rate in the price list -- type the total instead." };
  }
  const rateHr = (truck.hourlyRateAud ?? 0) + Math.max(0, input.movers! - 2) * rateCard.extraMoverHourlyRateAud;
  const hours = Math.max(rateCard.minimumJobHours, input.hours!);
  const labour = round2(rateHr * hours);
  const stair = round2(input.stairFlights * rateCard.accessExtras.perStairFlightAud);
  const packing = round2(input.packingAud);

  const charges = labour + stair + packing;
  const discount = input.firstMoveApplied ? charges * (rateCard.firstMoveDiscountPercent / 100) : 0;
  const withGst = (charges - discount) * (1 + rateCard.gst.ratePercent / 100);
  const calculatedTotal = Math.round(withGst / rateCard.roundToNearestAud) * rateCard.roundToNearestAud;

  return {
    ok: true,
    calculatedTotal: truck.hourlyRateAud === null ? null : calculatedTotal,
    lines: finishLines(
      { truck: input.truck, movers: input.movers, hours, rateHr: truck.hourlyRateAud === null ? null : rateHr, stairFlights: input.stairFlights, labour, callOut: 0, packing, stair, services },
      input.overrideTotal ?? calculatedTotal,
      rateCard.gst.ratePercent,
    ),
  };
}
