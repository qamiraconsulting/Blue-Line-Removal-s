import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe, called over plain HTTPS (no SDK). Two jobs only:
//  - make a Checkout page for one booking's deposit (card, plus PayTo -- paying straight from
//    a bank account -- when Blue Line has switched it on in the Stripe dashboard);
//  - check that a webhook really came from Stripe (the Stripe-Signature header).
// Keys are Vercel environment variables: STRIPE_SECRET_KEY (a restricted key with "Checkout
// Sessions: write" is enough) and STRIPE_WEBHOOK_SECRET (whsec_..., from the webhook endpoint).

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

/** Test keys (sk_test_ / rk_test_) take Stripe's test cards only -- never real money. */
export const isTestKey = (key: string) => /^(sk|rk)_test_/.test(key);

export function stripeConfigFrom(env: Record<string, string | undefined>): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;
  return { secretKey, webhookSecret };
}

export interface DepositCheckoutRequest {
  reference: string;
  amountCents: number;
  customerEmail: string;
  /** Where Stripe sends the customer after paying / going back. */
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds; Stripe allows 30 minutes to 24 hours from now. */
  expiresAt: number;
  /** Shown on the Stripe page, e.g. "Booking deposit -- move on Sat 7 Nov". */
  description: string;
}

export interface DepositCheckout {
  id: string;
  url: string;
  expiresAt: number;
}

export type StripeFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Creates the booking's Stripe Checkout page. Throws if Stripe says no. */
export async function createDepositCheckout(req: DepositCheckoutRequest, config: Pick<StripeConfig, "secretKey">, fetchImpl: StripeFetch = fetch): Promise<DepositCheckout> {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "aud",
    "line_items[0][price_data][unit_amount]": String(req.amountCents),
    "line_items[0][price_data][product_data][name]": "Booking deposit",
    "line_items[0][price_data][product_data][description]": req.description,
    client_reference_id: req.reference,
    "metadata[reference]": req.reference,
    "payment_intent_data[metadata][reference]": req.reference,
    "payment_intent_data[description]": `Booking deposit ${req.reference}`,
    customer_email: req.customerEmail,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    expires_at: String(req.expiresAt),
    // No payment_method_types: Stripe shows what's switched on in the dashboard (card, PayTo,
    // Apple Pay / Google Pay), so Blue Line can change it without a code change.
  });
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // A retry for the same booking and expiry gets the same page, never a second one.
      "Idempotency-Key": `deposit-${req.reference}-${req.expiresAt}`,
    },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; url?: string; expires_at?: number; error?: { type?: string; code?: string } } | null;
  if (!res.ok || !body?.id || !body.url) {
    // Never log the key or the customer's email -- only what kind of error Stripe gave.
    throw new Error(`Stripe checkout failed (${res.status} ${body?.error?.type ?? ""} ${body?.error?.code ?? ""})`.trim());
  }
  return { id: body.id, url: body.url, expiresAt: body.expires_at ?? req.expiresAt };
}

/**
 * Checks a webhook's Stripe-Signature header: "t=<unix>,v1=<hex hmac>[,v1=...]", where the
 * HMAC-SHA256 (keyed with the endpoint's whsec_ secret) is over "<t>.<raw body>". Rejects
 * anything older than `toleranceSeconds` so a captured message can't be replayed later.
 */
export function verifyStripeSignature(rawBody: string, header: string | undefined, webhookSecret: string, nowSeconds: number, toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string | undefined]);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k, v]) => k === "v1" && v).map(([, v]) => v!);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The parts of a Checkout Session event this app reads. */
export interface CheckoutSessionEvent {
  id: string;
  type: string;
  livemode: boolean;
  data: {
    object: {
      id: string;
      object: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
      amount_total?: number | null;
      currency?: string | null;
      payment_status?: "paid" | "unpaid" | "no_payment_required";
      payment_intent?: string | null;
      payment_method_types?: string[];
    };
  };
}
