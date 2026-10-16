import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbBookingStore } from "../../src/server/quote/booking.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { dbChatNote, dbDepositStore } from "../../src/server/payments/depositPayment.js";
import { handleStripeEvent } from "../../src/server/payments/depositWebhook.js";
import { stripeConfigFrom, verifyStripeSignature, type CheckoutSessionEvent } from "../../src/server/payments/stripe.js";

// Stripe -> us: the booking deposit was paid (or its page expired / the bank payment failed).
// Set up in Stripe: Developers -> Webhooks -> Add endpoint -> <site>/api/stripe/webhook, events
// checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed, checkout.session.expired. Its signing secret goes in
// STRIPE_WEBHOOK_SECRET. Every message is checked against that secret before anything happens.
// A 5xx makes Stripe retry later (it retries for up to 3 days); handling is safe to repeat.

// The signature is over the exact bytes Stripe sent, so Vercel must not parse the body.
export const config = { api: { bodyParser: false } };

async function rawBody(req: VercelRequest): Promise<string> {
  // Local dev (dev/vercelApiDev.ts) has already read the stream and keeps the original text.
  const kept = (req as VercelRequest & { rawBody?: string }).rawBody;
  if (typeof kept === "string") return kept;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const stripe = stripeConfigFrom(process.env);
  const deps = buildQuoteDeps();
  if (!stripe || !deps || !process.env.DATABASE_URL) {
    res.status(503).json({ error: "Deposits aren't set up" });
    return;
  }

  const body = await rawBody(req);
  const signature = req.headers["stripe-signature"];
  if (!verifyStripeSignature(body, Array.isArray(signature) ? signature[0] : signature, stripe.webhookSecret, Math.floor(Date.now() / 1000))) {
    res.status(400).json({ error: "Bad signature" });
    return;
  }

  let event: CheckoutSessionEvent;
  try {
    event = JSON.parse(body) as CheckoutSessionEvent;
  } catch {
    res.status(400).json({ error: "Bad body" });
    return;
  }

  try {
    const outcome = await handleStripeEvent(event, { ...deps, bookings: dbBookingStore, depositStore: dbDepositStore, chatNote: dbChatNote });
    console.log(`Stripe ${event.type}: ${outcome}`); // no customer details in logs
    res.status(200).json({ received: true, outcome });
  } catch (err) {
    console.error(`Stripe ${event.type} failed:`, err instanceof Error ? err.message : "unknown error");
    res.status(500).json({ error: "Try again" });
  }
}
