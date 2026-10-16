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
import { moverCounts, truckIds, type RateCard } from "./rateCard.js";
import type { NewQuoteRow, QuoteStore } from "./store.js";
import type { PdfSender } from "../jobs/pdfQuote.js";

// Ties the quote form to the engine: validate -> distances -> price -> store -> email.
// Everything external (Google, the database, email, the clock) is injected, so the whole
// flow is testable without a network. See api/quote.ts for the real wiring.

// Home size: the quote form sends its dropdown labels; the chat sends the ids. Both map here.
export const propertySizeIds = ["studio_1bed", "2_bed", "3_bed", "4plus_bed", "commercial", "unsure"] as const;
export const SIZE_LABEL: Record<PropertySizeId, string> = {
  studio_1bed: "Studio / 1 Bed",
  "2_bed": "2 Bedroom",
  "3_bed": "3 Bedroom",
  "4plus_bed": "4+ Bedroom",
  commercial: "Office / Commercial",
  unsure: "Not sure yet",
};
const SIZE_BY_TEXT: Record<string, PropertySizeId> = Object.fromEntries(
  propertySizeIds.flatMap((id) => [
    [id, id],
    [SIZE_LABEL[id].toLowerCase(), id],
  ]),
);

// Truck and crew (email of 2026-10-12): the customer may choose a truck and 2-4 movers, or
// ask the team to inspect. Not chosen = the home size guide's truck and crew.
export const truckChoices = [...truckIds, "inspect"] as const;
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const moverSchema = z.union(moverCounts.map((n) => z.literal(n)) as [z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>]);

export const quoteRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(50),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  need: z.enum(["moving", "junk"]).optional().default("moving"),
  from: z.string().trim().max(200).optional().default(""),
  to: z.string().trim().max(200).optional().default(""),
  date: z.string().trim().max(10).optional().default(""),
  truck: z.preprocess(blankToUndefined, z.enum(truckChoices).optional()),
  movers: z.preprocess(blankToUndefined, z.coerce.number().pipe(moverSchema).optional()),
  propertySize: z.string().trim().max(100).optional().default(""),
  // Stairs, parking distance, heavy items -- free text, passed to the team with the quote.
  accessNotes: z.string().trim().max(1000).optional().default(""),
  // Priced access (chat, 2026-10-16): flights of stairs carried (no lift) at each end, and a
  // long carry when the truck can't park within 100 m of the door.
  pickupStairFlights: z.coerce.number().int().min(0).max(30).optional().default(0),
  dropoffStairFlights: z.coerce.number().int().min(0).max(30).optional().default(0),
  longCarry: z.boolean().optional().default(false),
  // The website form's optional "Additional notes" box.
  notes: z.string().trim().max(1000).optional().default(""),
  // Ignored: the first-customer discount is now worked out from the database (see below).
  firstMove: z.boolean().optional().default(false),
  specialItems: z.boolean().optional().default(false),
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
  /**
   * Preview only: while prices are test figures, customer emails go HERE instead of to the
   * customer (subject marked [TEST]) so the team can try the whole flow. Unset = test-mode
   * customer emails aren't sent at all. Never used in production.
   */
  testEmailTo?: string | null;
  /** Makes and emails the branded PDF quote (Apps Script). Unset = plain email instead. */
  pdf?: PdfSender;
  /** The secure payment link for the booking deposit (src/server/quote/deposit.ts). Unset = the team sends one. */
  depositPaymentUrl?: string | null;
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

export const melbourneToday = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(now);

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function normalisePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("61")) digits = `0${digits.slice(2)}`;
  // Google Sheets stores a mobile as a number and drops its leading 0 (412 345 678).
  if (/^4\d{8}$/.test(digits)) digits = `0${digits}`;
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

/** Where the request came from -- recorded on the quote row. */
export interface QuoteRequestContext {
  source: "quote_form" | "chatbot";
  conversationId?: string;
  /**
   * The chat already knows this job needs the team (a few boxes, regional, a piano...): skip
   * pricing and the distance lookups, record it for a personal quote with the customer's own
   * description, and acknowledge it.
   */
  personalQuote?: { reason: PersonalQuoteReason; description: string };
}

export const personalQuoteReasons = [
  "small_load",
  "specialist_item",
  "junk_removal",
  "office_move",
  "storage",
  "warehouse",
  "outside_melbourne",
  "urgent_or_timed",
  "packing",
  "other",
] as const;
export type PersonalQuoteReason = (typeof personalQuoteReasons)[number];

export async function handleQuoteRequest(
  rawBody: unknown,
  deps: QuoteServiceDeps,
  context: QuoteRequestContext = { source: "quote_form" },
): Promise<QuoteApiResponse> {
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

  const movingDate = usableDate(req.date, today);
  const propertySize: PropertySizeId | null = req.propertySize ? (SIZE_BY_TEXT[req.propertySize.toLowerCase()] ?? "unsure") : null;

  // First-customer offer (Ayesha, 2026-10-16): nobody is asked any more -- anyone whose email
  // and phone have no earlier booked or completed job with Blue Line gets it automatically.
  // Estimates alone don't count, so asking twice doesn't lose it. If we can't check, we can't
  // honour it.
  let firstMoveEligible = false;
  const canCheckCustomer = Boolean(deps.store);
  if (deps.store) {
    try {
      firstMoveEligible = !(await deps.store.isReturningCustomer(emailNormalised, phoneNormalised));
    } catch (err) {
      log("first-customer check failed", { err: String(err) });
    }
  }

  // No database or no Maps key = we can't price safely or record what we quoted.
  const canPrice = Boolean(deps.store && deps.routes) && !context.personalQuote;
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
    truck: req.truck ?? null,
    movers: req.movers ?? null,
    movingDate,
    firstMoveRequested: canCheckCustomer,
    firstMoveEligible,
    // Stairs and a long carry are priced from the rate card; heavy items stay in the free-text
    // access notes for the team.
    access: { pickupStairFlights: req.pickupStairFlights, dropoffStairFlights: req.dropoffStairFlights, longCarry: req.longCarry, heavyItems: 0 },
    specialItems: req.specialItems,
    depotToPickup,
    pickupToDropoff,
  };

  type Outcome = QuoteOutcome | { kind: "manual"; reason: ManualReason | PersonalQuoteReason | "service_unavailable" };
  let outcome: Outcome = context.personalQuote
    ? { kind: "manual", reason: context.personalQuote.reason }
    : canPrice
    ? calculateQuote(inputs, deps.rateCard, { allowPlaceholderRateCard: deps.allowPlaceholderRateCard })
    : { kind: "manual", reason: "service_unavailable" };

  const reference = (deps.makeReference ?? defaultReference)(now);
  const testMode = deps.rateCard.status !== "confirmed";
  const bookingToken = context.source === "quote_form" ? randomBytes(16).toString("hex") : null;

  const buildRow = (o: Outcome): NewQuoteRow => ({
    reference,
    source: context.source,
    conversationId: context.conversationId ?? null,
    status: o.kind === "price" ? "priced" : "manual_review",
    jobStatus: o.kind === "price" ? "estimate_sent" : "waiting_for_quote",
    bookingToken: o.kind === "price" ? bookingToken : null,
    customerNotes: req.notes || null,
    manualReason: o.kind === "manual" ? o.reason : null,
    customerName: req.name,
    phone: req.phone,
    email: req.email,
    emailNormalised,
    phoneNormalised,
    need: req.need,
    propertySize,
    truck: req.truck ?? null,
    movers: req.movers ?? null,
    accessNotes: req.accessNotes || null,
    jobDescription: context.personalQuote?.description || null,
    movingDate,
    fromText: req.from || null,
    toText: req.to || null,
    firstMoveRequested: canCheckCustomer,
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

  const priced = outcome.kind === "price" ? outcome : null;
  // The truck and crew actually estimated (customer's choice or the home size guide's).
  const capacityLabel = () => {
    if (req.truck === "inspect") return "Team to inspect and confirm";
    const truck = priced ? (priced.internal.truck as keyof RateCard["trucks"]) : req.truck;
    const movers = priced ? priced.internal.movers : req.movers;
    if (!truck) return movers ? `${movers} movers` : "";
    return `${deps.rateCard.trucks[truck].label}${movers ? `, ${movers} movers` : ""}`;
  };
  const details: QuoteDetails = {
    from: req.from,
    to: req.to,
    dateLabel: formatDateLabel(movingDate),
    propertySize: propertySize ? SIZE_LABEL[propertySize] : "",
    capacity: capacityLabel(),
    accessNotes: req.accessNotes,
  };
  const validUntil = priced ? addDays(today, priced.customer.validDays) : "";

  const outcomeLine = priced
    ? `PRICED ${formatAud(priced.amountAud)} (rate card ${deps.rateCard.version}, ${deps.rateCard.status})`
    : context.personalQuote
      ? `PERSONAL QUOTE REQUESTED in the chat -- ${context.personalQuote.reason}`
      : `MANUAL REVIEW -- ${(outcome as { reason: string }).reason}`;
  const team = renderTeamEmail({
    reference,
    name: req.name,
    phone: req.phone,
    email: req.email,
    need: req.need,
    details,
    firstMoveRequested: canCheckCustomer,
    firstMoveApplied: priced?.customer.firstMoveApplied ?? false,
    outcomeLine: testMode ? `[TEST MODE -- placeholder rate card] ${outcomeLine}` : outcomeLine,
    internalBreakdown: priced ? { ...priced.internal } : null,
    jobDescription: context.personalQuote?.description,
    customerNotes: req.notes || undefined,
    source: context.source,
  });

  // Placeholder prices are never emailed to a customer -- in a preview they can go to the
  // team's test inbox instead.
  const customerTo = customerRecipient(req.email, testMode, deps.testEmailTo);
  const customerContent: EmailContent | null = !customerTo
    ? null
    : priced
      ? renderCustomerQuoteEmail({
          name: req.name,
          reference,
          amountAud: priced.amountAud,
          includes: priced.customer.includes,
          firstMoveApplied: priced.customer.firstMoveApplied,
          discountPercent: deps.rateCard.firstMoveDiscountPercent,
          validUntilLabel: formatDateLabel(validUntil),
          details,
        })
      : renderAcknowledgementEmail({ name: req.name, reference });

  const [teamSent, customerSent] = await Promise.all([
    deps.sendEmail({ ...team, to: deps.teamEmail, replyTo: `${req.name} <${req.email}>`, kind: "team" }).catch(() => false),
    customerContent && customerTo
      ? deps
          .sendEmail({ ...customerContent, subject: testMode ? `[TEST] ${customerContent.subject}` : customerContent.subject, to: customerTo, replyTo: deps.customerReplyTo, kind: "customer" })
          .catch(() => false)
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
        firstMoveDenied: false, // returning customers simply get the standard price
        validUntil,
        emailed: customerSent,
        testMode,
        ...(bookingToken ? { bookingToken } : {}),
      },
    },
  };
}

/** Where a customer email goes: the customer -- or, for test figures, the preview's test inbox (or nowhere). */
export function customerRecipient(email: string, testMode: boolean, testEmailTo: string | null | undefined): string | null {
  if (!testMode) return email;
  return testEmailTo || null;
}
