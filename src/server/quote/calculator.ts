import { calculateQuote, chargedHours, priceJob, type ManualReason } from "./calculateQuote.js";
import { resolveLeg, type DistanceCache, type RoutesClientConfig } from "./distance.js";
import type { HomeSizeId, RateCard, TruckId } from "./rateCard.js";
import { longCarryAtEnd } from "./service.js";
import { customerLines, linesFromEstimate, type QuoteLines } from "../jobs/lines.js";

// The dashboard's "+ New job" Quick estimate, and Matt's Google Form jobs priced from it.
//
//  - quickEstimate(): the sales team confirms the move on the call (addresses, home size, truck
//    and crew, stairs, parking, heavy items, date). Same engine as the chat: calculateQuote
//    checks the job (service area, date...), then the price comes from the guide's hours plus the
//    Google Maps drive.
//  - priceFormJob(): "Fill form" puts those hours, crew, stairs, long carry and heavy items into
//    Matt's Google Form BEFORE any discount. On submit his Apps Script sends them back here
//    (/api/intake "priceQuote") with its own new/returning decision, and gets the PDF lines.
//    The Quick estimate shows priceFormJob() of exactly the hours it fills in, so the calculator,
//    the PDF and the email always match -- and the 10% is applied once, by the script's call.
//
// Weekend / public-holiday surcharges are 0 on the approved price list; the form path doesn't
// see the date, so it would need the date added if a surcharge ever comes in.

export interface FormJob {
  truck: TruckId;
  movers: number;
  /** Charged hours, as in the form's "Est. hours" (4 decimals from Fill form). */
  hours: number;
  /** The form's "Rate p/h", when it's a real rate; else the price list's rate for this crew. */
  rateHr?: number | null;
  stairFlights: number;
  longCarryEnds: number;
  heavyItems: number;
  /** Decided by the caller: the 10% first-booking discount applies. */
  newCustomer: boolean;
}

export interface PricedForm {
  /** The customer's lines: the rounding to $10 is folded into Moving Labour, as on every quote. */
  lines: QuoteLines;
  /** The rounding to $10 that the labour line includes (for a grey note on the dashboard). */
  roundingAud: number;
  total: number;
}

export function crewRateFor(truck: TruckId, movers: number, rateCard: RateCard): number | null {
  const rate = rateCard.trucks[truck].hourlyRateAud;
  return rate === null ? null : rate + Math.max(0, movers - 2) * rateCard.extraMoverHourlyRateAud;
}

export function priceFormJob(job: FormJob, rateCard: RateCard): PricedForm | null {
  const crewRate = job.rateHr && job.rateHr > 0 ? job.rateHr : crewRateFor(job.truck, job.movers, rateCard);
  if (crewRate === null) return null;
  const priced = priceJob(
    {
      truck: job.truck,
      movers: job.movers,
      jobHours: job.hours,
      crewRate,
      capacityFrom: "customer",
      stairFlights: job.stairFlights,
      longCarryEnds: job.longCarryEnds,
      heavyItems: job.heavyItems,
      surchargePercent: 0,
      firstMoveApplied: job.newCustomer,
    },
    rateCard,
  );
  const raw = linesFromEstimate(priced.internal, priced.amountAud, rateCard);
  return { lines: customerLines(raw), roundingAud: raw.rounding ?? 0, total: priced.amountAud };
}

export interface QuickEstimateRequest {
  from: string;
  to: string;
  propertySize: HomeSizeId;
  truck: TruckId;
  movers: number;
  movingDate: string;
  pickupApartment: boolean;
  pickupStairFlights: number;
  pickupParkingOver50m: boolean;
  dropoffApartment: boolean;
  dropoffStairFlights: number;
  dropoffParkingOver50m: boolean;
  heavyItems: number;
  newCustomer: boolean;
}

export type QuickEstimate =
  | ({
      ok: true;
      /** Exactly what Fill form puts in "Est. hours". */
      hours: number;
      distanceKm: number;
      travelMinutes: number;
      longCarryEnds: number;
    } & PricedForm)
  | { ok: false; reason: ManualReason | "crew_not_allowed" };

export async function quickEstimate(
  req: QuickEstimateRequest,
  deps: { rateCard: RateCard; routes: RoutesClientConfig; cache?: DistanceCache },
): Promise<QuickEstimate> {
  const { rateCard } = deps;
  if (!rateCard.allowedMovers[req.truck]?.includes(req.movers)) return { ok: false, reason: "crew_not_allowed" };
  const [depotToPickup, pickupToDropoff] = await Promise.all([
    resolveLeg(rateCard.serviceArea.depotAddress, req.from, { routes: deps.routes, cache: deps.cache }),
    resolveLeg(req.from, req.to, { routes: deps.routes, cache: deps.cache }),
  ]);
  const access = {
    pickupStairFlights: req.pickupStairFlights,
    dropoffStairFlights: req.dropoffStairFlights,
    pickupLongCarry: longCarryAtEnd(req.pickupApartment, req.pickupParkingOver50m),
    dropoffLongCarry: longCarryAtEnd(req.dropoffApartment, req.dropoffParkingOver50m),
    heavyItems: req.heavyItems,
  };
  // The chat's own engine first: it refuses what needs a person (outside the area, no route...).
  const engine = calculateQuote(
    {
      need: "moving",
      propertySize: req.propertySize,
      truck: req.truck,
      movers: req.movers as 2 | 3 | 4,
      movingDate: req.movingDate,
      firstMoveRequested: true,
      firstMoveEligible: req.newCustomer,
      access,
      specialItems: false,
      depotToPickup,
      pickupToDropoff,
    },
    rateCard,
  );
  if (engine.kind === "manual" || !pickupToDropoff) return { ok: false, reason: engine.kind === "manual" ? engine.reason : "distance_unavailable" };

  const guide = rateCard.jobSizes[req.propertySize]!;
  const hours = Math.round(chargedHours(guide.typicalHours, pickupToDropoff.minutes, rateCard) * 10000) / 10000;
  const longCarryEnds = (access.pickupLongCarry ? 1 : 0) + (access.dropoffLongCarry ? 1 : 0);
  const priced = priceFormJob(
    {
      truck: req.truck,
      movers: req.movers,
      hours,
      stairFlights: req.pickupStairFlights + req.dropoffStairFlights,
      longCarryEnds,
      heavyItems: req.heavyItems,
      newCustomer: req.newCustomer,
    },
    rateCard,
  );
  if (!priced) return { ok: false, reason: "rate_card_incomplete" };
  return { ok: true, hours, distanceKm: pickupToDropoff.km, travelMinutes: pickupToDropoff.minutes, longCarryEnds, ...priced };
}
