import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { conversations, messages, quotes } from "../db/schema.js";
import { DEPOSIT_AUD } from "../quote/deposit.js";
import { formatDateLabel } from "../quote/emails.js";
import { createDepositCheckout, type DepositCheckout, type DepositCheckoutRequest, type StripeConfig } from "./stripe.js";

// The booking deposit, paid on a Stripe Checkout page made for one booking (Ayesha, 2026-10-16:
// "once the payment is received the system should know it and confirm the booking based on
// the slot availability"). This file makes / reuses that page and records what Stripe tells
// us; depositWebhook.ts acts on Stripe's messages. A plain bank transfer to Blue Line's own
// account was dropped: nothing could tell the system it arrived. Customers who want to pay
// from their bank use PayTo on the same Stripe page.

/** How long a payment page stays open. Stripe's maximum is 24 hours. */
export const DEPOSIT_LINK_HOURS = 24;

export type DepositStatus = "awaiting_payment" | "processing" | "paid" | "failed" | "expired";

export interface DepositPaid {
  checkoutId: string;
  amountCents: number;
  paymentIntentId: string | null;
  method: string;
  testMode: boolean;
}

export interface DepositStore {
  saveCheckout(reference: string, checkout: DepositCheckout): Promise<void>;
  /** PayTo: the customer approved it in their banking app; Stripe confirms shortly. */
  markProcessing(reference: string, checkoutId: string): Promise<void>;
  /** Records the payment once. false = it was already recorded (Stripe sent it twice). */
  markPaid(reference: string, paid: DepositPaid): Promise<boolean>;
  /** Only while that page is still the open one. false = nothing changed. */
  markEnded(reference: string, checkoutId: string, status: "failed" | "expired"): Promise<boolean>;
}

export interface DepositPaymentDeps {
  stripe: Pick<StripeConfig, "secretKey">;
  store: DepositStore;
  /** e.g. https://www.bluelineremovals.com.au -- where Stripe sends the customer back to. */
  siteUrl: string;
  createCheckout?: (req: DepositCheckoutRequest) => Promise<DepositCheckout>;
}

export type DepositQuote = Pick<
  typeof quotes.$inferSelect,
  "reference" | "email" | "movingDate" | "depositStatus" | "depositCheckoutUrl" | "depositCheckoutExpiresAt"
>;

/**
 * The booking's payment link: the open one if it has at least an hour left, else a new page.
 * null = Stripe isn't set up, the deposit is already paid, or Stripe failed (the team is then
 * told to send a link) -- never throws.
 */
export async function depositCheckoutFor(q: DepositQuote, deps: DepositPaymentDeps | undefined, now: Date): Promise<string | null> {
  if (!deps) return null;
  if (q.depositStatus === "paid" || q.depositStatus === "processing") return null;
  if (q.depositCheckoutUrl && q.depositCheckoutExpiresAt && q.depositCheckoutExpiresAt.getTime() - now.getTime() > 60 * 60 * 1000 && q.depositStatus === "awaiting_payment") {
    return q.depositCheckoutUrl;
  }
  const back = (status: string) => `${deps.siteUrl.replace(/\/+$/, "")}/deposit?status=${status}&ref=${encodeURIComponent(q.reference)}`;
  try {
    const create = deps.createCheckout ?? ((req) => createDepositCheckout(req, deps.stripe));
    const checkout = await create({
      reference: q.reference,
      amountCents: DEPOSIT_AUD * 100,
      customerEmail: q.email,
      successUrl: back("paid"),
      cancelUrl: back("cancelled"),
      // A minute under Stripe's 24-hour maximum.
      expiresAt: Math.floor(now.getTime() / 1000) + DEPOSIT_LINK_HOURS * 3600 - 60,
      description: `Blue Line Removals, booking ${q.reference}${q.movingDate ? ` -- move on ${formatDateLabel(q.movingDate)}` : ""}. The rest is paid on the day.`,
    });
    await deps.store.saveCheckout(q.reference, checkout);
    return checkout.url;
  } catch (err) {
    console.error("Deposit payment page failed:", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

export const dbDepositStore: DepositStore = {
  async saveCheckout(reference, checkout) {
    await getDb()
      .update(quotes)
      .set({
        depositStatus: "awaiting_payment",
        depositCheckoutId: checkout.id,
        depositCheckoutUrl: checkout.url,
        depositCheckoutExpiresAt: new Date(checkout.expiresAt * 1000),
      })
      .where(and(eq(quotes.reference, reference), or(isNull(quotes.depositStatus), ne(quotes.depositStatus, "paid"))));
  },
  async markProcessing(reference, checkoutId) {
    await getDb()
      .update(quotes)
      .set({ depositStatus: "processing", depositCheckoutId: checkoutId })
      .where(and(eq(quotes.reference, reference), or(isNull(quotes.depositStatus), inArray(quotes.depositStatus, ["awaiting_payment", "expired", "failed"]))));
  },
  async markPaid(reference, paid) {
    const rows = await getDb()
      .update(quotes)
      .set({
        depositStatus: "paid",
        depositPaidAt: new Date(),
        depositCheckoutId: paid.checkoutId,
        depositAmountCents: paid.amountCents,
        depositPaymentIntentId: paid.paymentIntentId,
        depositPaymentMethod: paid.method,
        depositTestMode: paid.testMode,
      })
      .where(and(eq(quotes.reference, reference), or(isNull(quotes.depositStatus), ne(quotes.depositStatus, "paid"))))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
  async markEnded(reference, checkoutId, status) {
    const rows = await getDb()
      .update(quotes)
      .set({ depositStatus: status })
      .where(and(eq(quotes.reference, reference), eq(quotes.depositCheckoutId, checkoutId), inArray(quotes.depositStatus, ["awaiting_payment", "processing"])))
      .returning({ reference: quotes.reference });
    return rows.length > 0;
  },
};

/** Adds a message from the assistant to the customer's chat, so they see it if they come back. */
export async function dbChatNote(conversationId: string, text: string): Promise<void> {
  const db = getDb();
  await db.insert(messages).values({ conversationId, role: "assistant", content: text });
  await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));
}

/** Where Stripe sends customers back to: SITE_URL, else this deployment's own address. */
export function siteUrlFrom(env: Record<string, string | undefined>): string {
  if (env.SITE_URL) return env.SITE_URL;
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:5173";
}
