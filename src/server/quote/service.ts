import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  calculateQuote,
  type LegDistance,
  type ManualReason,
  type PropertySizeId,
  type QuoteInputs,
  type QuoteOutcome,
} from "./calculateQuote.js";
import { resolveLeg, type DistanceCache, type RoutesClientConfig } from "./distance.js";
import {
  formatAud,
  formatDateLabel,
  renderAcknowledgementEmail,
  renderCustomerQuoteEmail,
  renderTeamEmail,
  type EmailContent,
  type QuoteDetails,
} from "./emails.js";
import type { QuoteApiResult } from "../../lib/quoteContract.js";
import type { RateCard } from "./rateCard.js";
import type { NewQuoteRow, QuoteStore } from "./store.js";

// Ties the quote form to the engine: validate -> distances -> price -> store -> email.
// Everything external (Google, the database, email, the clock) is injected, so the whole
// flow is testable without a network. See api/quote.ts for the real wiring.

const SIZE_BY_LABEL: Record<string, PropertySizeId> = {
  "studio / 1 bed": "studio_1bed",
  "2 bedroom": "2_bed",
  "3 bedroom": "3_bed",
  "4+ bedroom": "4plus_bed",
  "office / commercial": "commercial",
  "not sure yet": "unsure",
};

const count = (max: number) => z.coerce.number().int().min(0).max(max).optional().default(0);

export const quoteRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(50),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  need: z.enum(["moving", "junk"]).optional().default("moving"),
  from: z.string().trim().max(200).optional().default(""),
  to: z.string().trim().max(200).optional().default(""),
  date: z.string().trim().max(10).optional().default(""),
  propertySize: z.string().trim().max(100).optional().default(""),
  firstMove: z.boolean().optional().default(false),
  specialItems: z.boolean().optional().default(false),
  access: z
    .object({
      pickupStairFlights: count(10),
      dropoffStairFlights: count(10),
      longCarry: z.boolean().optional().default(false),
      heavyItems: count(20),
    })
    .optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export interface OutgoingEmail extends EmailContent {
  to: string;
  replyTo?: string;
  kind: "customer" | "team";
}

export interface QuoteServiceDeps {
  rateCard: RateCard;
  /** Dev/preview only -- api/quote.ts forces this off in Vercel production. */
  allowPlaceholderRateCard: boolean;
  routes: RoutesClientConfig | null;
  cache?: DistanceCache;
  store?: QuoteStore;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  teamEmail: string;
  customerReplyTo: string;
  now?: () => Date;
  makeReference?: (now: Date) => string;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

// The response shape lives in src/lib so the quote page shares it (types only).
export type { QuoteApiResult };

export type QuoteApiResponse =
  | { status: 200; body: { ok: true; result: QuoteApiResult } }
  | { status: 400 | 429 | 502; body: { ok: false; error: string } };

const defaultReference = (now: Date) =>
  `BLR-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

const melbourneToday = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(now);

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function normalisePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("61")) digits = `0${digits.slice(2)}`;
  return digits;
}

/** A valid calendar date that isn't in the past (Melbourne time), else null. */
function usableDate(value: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return null;
  return value < today ? null : value;
}

// Keeps the form's existing wording: blank name/phone/email -> "required"; a present but
// malformed email/phone gets its own message.
function requestError(error: z.ZodError, input: Record<string, unknown>): string {
  const blank = (key: string) => typeof input[key] !== "string" || (input[key] as string).trim() === "";
  if (blank("name") || blank("phone") || blank("email")) return "Name, phone, and email are required.";
  const failed = new Set(error.issues.map((i) => String(i.path[0])));
  if (failed.has("email")) return "Enter a valid email address.";
  if (failed.has("phone")) return "Enter a valid phone number.";
  return "Something in that request wasn't valid. Please check the form and try again.";
}

export async function handleQuoteRequest(rawBody: unknown, deps: QuoteServiceDeps): Promise<QuoteApiResponse> {
  const log = deps.log ?? ((message, meta) => console.error(message, meta ?? ""));
  const now = (deps.now ?? (() => new Date()))();
  const today = melbourneToday(now);

  // The form sends null for fields it couldn't read; treat those as missing.
  const cleaned =
    rawBody && typeof rawBody === "object"
      ? Object.fromEntries(Object.entries(rawBody as Record<string, unknown>).filter(([, v]) => v !== null))
      : {};
  const parsed = quoteRequestSchema.safeParse(cleaned);
  if (!parsed.success) return { status: 400, body: { ok: false, error: requestError(parsed.error, cleaned) } };
  const req = parsed.data;

  const emailNormalised = req.email;
  const phoneNormalised = normalisePhone(req.phone);

  if (deps.store) {
    try {
      if ((await deps.store.recentQuoteCount(emailNormalised, 60)) >= 3) {
        return {
          status: 429,
          body: { ok: false, error: "You've already requested a few quotes this hour. We'll be in touch shortly." },
        };
      }
    } catch (err) {
      log("quote throttle check failed", { err: String(err) });
    }
  }

  const propertySize: PropertySizeId = SIZE_BY_LABEL[req.propertySize.toLowerCase()] ?? "unsure";
  const movingDate = usableDate(req.date, today);

  // First-move offer: once per email/phone. If we can't check, we can't honour it.
  let firstMoveEligible = false;
  if (req.firstMove && deps.store) {
    try {
      firstMoveEligible = !(await deps.store.hasDiscountedQuote(emailNormalised, phoneNormalised));
    } catch (err) {
      log("first-move check failed", { err: String(err) });
    }
  }

  // No database or no Maps key = we can't price safely or record what we quoted.
  const canPrice = Boolean(deps.store && deps.routes);
  let depotToPickup: LegDistance | null = null;
  let pickupToDropoff: LegDistance | null = null;
  if (canPrice && req.from && req.to) {
    [depotToPickup, pickupToDropoff] = await Promise.all([
      resolveLeg(deps.rateCard.serviceArea.depotAddress, req.from, { routes: deps.routes, cache: deps.cache }),
      resolveLeg(req.from, req.to, { routes: deps.routes, cache: deps.cache }),
    ]);
  }

  const inputs: QuoteInputs = {
    need: req.need,
    propertySize,
    movingDate,
    firstMoveRequested: req.firstMove,
    firstMoveEligible,
    access: {
      pickupStairFlights: req.access?.pickupStairFlights ?? 0,
      dropoffStairFlights: req.access?.dropoffStairFlights ?? 0,
      longCarry: req.access?.longCarry ?? false,
      heavyItems: req.access?.heavyItems ?? 0,
    },
    specialItems: req.specialItems,
    depotToPickup,
    pickupToDropoff,
  };

  type Outcome = QuoteOutcome | { kind: "manual"; reason: ManualReason | "service_unavailable" };
  let outcome: Outcome = canPrice
    ? calculateQuote(inputs, deps.rateCard, { allowPlaceholderRateCard: deps.allowPlaceholderRateCard })
    : { kind: "manual", reason: "service_unavailable" };

  const reference = (deps.makeReference ?? defaultReference)(now);
  const testMode = deps.rateCard.status !== "confirmed";

  const buildRow = (o: Outcome): NewQuoteRow => ({
    reference,
    status: o.kind === "price" ? "priced" : "manual_review",
    manualReason: o.kind === "manual" ? o.reason : null,
    customerName: req.name,
    phone: req.phone,
    email: req.email,
    emailNormalised,
    phoneNormalised,
    need: req.need,
    propertySize,
    movingDate,
    fromText: req.from || null,
    toText: req.to || null,
    firstMoveRequested: req.firstMove,
    firstMoveApplied: o.kind === "price" ? o.customer.firstMoveApplied : false,
    amountAud: o.kind === "price" ? o.amountAud : null,
    validUntil: o.kind === "price" ? addDays(today, o.customer.validDays) : null,
    rateCardVersion: deps.rateCard.version,
    rateCardStatus: deps.rateCard.status,
    inputs,
    internalBreakdown: o.kind === "price" ? o.internal : null,
    rateCardSnapshot: deps.rateCard,
  });

  // Never show a price we didn't record: if the save fails, fall back to a person.
  let saved = false;
  if (deps.store) {
    try {
      await deps.store.saveQuote(buildRow(outcome));
      saved = true;
    } catch (err) {
      log("quote save failed", { reference, err: String(err) });
      if (outcome.kind === "price") {
        outcome = { kind: "manual", reason: "service_unavailable" };
        try {
          await deps.store.saveQuote(buildRow(outcome));
          saved = true;
        } catch {
          // already logged; the team email below still carries the lead
        }
      }
    }
  }

  const details: QuoteDetails = {
    from: req.from,
    to: req.to,
    dateLabel: formatDateLabel(movingDate),
    propertySize: req.propertySize,
  };
  const priced = outcome.kind === "price" ? outcome : null;
  const validUntil = priced ? addDays(today, priced.customer.validDays) : "";

  const outcomeLine = priced
    ? `PRICED ${formatAud(priced.amountAud)} (rate card ${deps.rateCard.version}, ${deps.rateCard.status})`
    : `MANUAL REVIEW -- ${(outcome as { reason: string }).reason}`;
  const team = renderTeamEmail({
    reference,
    name: req.name,
    phone: req.phone,
    email: req.email,
    need: req.need,
    details,
    firstMoveRequested: req.firstMove,
    firstMoveApplied: priced?.customer.firstMoveApplied ?? false,
    outcomeLine: testMode ? `[TEST MODE -- placeholder rate card] ${outcomeLine}` : outcomeLine,
    internalBreakdown: priced ? { ...priced.internal } : null,
  });

  // Placeholder prices are never emailed to a customer.
  const customerContent: EmailContent | null = testMode
    ? null
    : priced
      ? renderCustomerQuoteEmail({
          name: req.name,
          reference,
          amountAud: priced.amountAud,
          includes: priced.customer.includes,
          firstMoveApplied: priced.customer.firstMoveApplied,
          validUntilLabel: formatDateLabel(validUntil),
          details,
        })
      : renderAcknowledgementEmail({ name: req.name, reference });

  const [teamSent, customerSent] = await Promise.all([
    deps.sendEmail({ ...team, to: deps.teamEmail, replyTo: `${req.name} <${req.email}>`, kind: "team" }).catch(() => false),
    customerContent
      ? deps.sendEmail({ ...customerContent, to: req.email, replyTo: deps.customerReplyTo, kind: "customer" }).catch(() => false)
      : Promise.resolve(false),
  ]);

  // The lead must land somewhere: if it wasn't stored and the team email failed, say so.
  if (!teamSent && !saved) {
    return { status: 502, body: { ok: false, error: "We couldn't send that just now. Please email us instead." } };
  }

  if (customerSent && saved && deps.store) {
    try {
      await deps.store.markCustomerEmailSent(reference);
    } catch {
      // not critical
    }
  }

  if (!priced) return { status: 200, body: { ok: true, result: { kind: "manual", reference, emailed: customerSent } } };

  return {
    status: 200,
    body: {
      ok: true,
      result: {
        kind: "price",
        reference,
        amountAud: priced.amountAud,
        includes: priced.customer.includes,
        firstMoveApplied: priced.customer.firstMoveApplied,
        firstMoveDenied: req.firstMove && !priced.customer.firstMoveApplied,
        validUntil,
        emailed: customerSent,
        testMode,
      },
    },
  };
}
