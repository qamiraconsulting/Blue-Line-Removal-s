import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { site } from "../src/data/site.js";
import { getActiveRateCard } from "../src/server/quote/rateCard.js";
import { handleQuoteRequest, type OutgoingEmail } from "../src/server/quote/service.js";
import { dbDistanceCache, dbQuoteStore } from "../src/server/quote/store.js";
import { checkQuoteRateLimit } from "../src/server/services/rateLimit.js";

// Server-side only -- every secret is a Vercel environment variable (Project Settings ->
// Environment Variables), never committed. See .env.example for the full list.
//
// What this does now: validates the quote form, works out the driving distance, prices the
// job with the flat-price engine (src/server/quote), stores the quote, emails the customer
// their price and notifies the team. If the database or Google key isn't configured it
// degrades to the old behaviour: the lead still reaches the team and the customer is told
// we'll send the quote -- it never guesses a price.
//
// LEAD_FROM_EMAIL must be an address on a domain verified in Resend (today that is Qamira's
// sending domain; verify bluelineremovals.com.au so customer quotes come from BLR's own
// domain). LEAD_TO_EMAIL is the team inbox -- a temporary default until the client's real
// mailbox exists.
const LEAD_TO_EMAIL = process.env.LEAD_TO_EMAIL ?? "qamiraconsulting@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.LEAD_FROM_EMAIL) {
    res.status(500).json({ error: "The quote form isn't configured yet. Please email us directly instead." });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkQuoteRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ ok: false, error: "Too many requests. Please wait a few minutes and try again." });
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.LEAD_FROM_EMAIL;

  const sendEmail = async (email: OutgoingEmail): Promise<boolean> => {
    try {
      const { error } = await resend.emails.send({
        from: `${email.kind === "customer" ? site.name : `${site.name} Website`} <${fromAddress}>`,
        to: [email.to],
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) {
        console.error(`${email.kind} email failed:`, error.name); // never log addresses or content
        return false;
      }
      return true;
    } catch {
      console.error(`${email.kind} email failed to send`);
      return false;
    }
  };

  // Placeholder rate cards can only ever price in local dev / previews -- never production.
  const allowPlaceholderRateCard = process.env.QUOTE_ALLOW_PLACEHOLDER === "true" && process.env.VERCEL_ENV !== "production";
  const databaseConfigured = Boolean(process.env.DATABASE_URL);

  const response = await handleQuoteRequest(req.body, {
    rateCard: getActiveRateCard(),
    allowPlaceholderRateCard,
    routes: process.env.GOOGLE_MAPS_SERVER_KEY ? { apiKey: process.env.GOOGLE_MAPS_SERVER_KEY } : null,
    cache: databaseConfigured ? dbDistanceCache : undefined,
    store: databaseConfigured ? dbQuoteStore : undefined,
    sendEmail,
    teamEmail: LEAD_TO_EMAIL,
    customerReplyTo: site.email,
  });

  res.status(response.status).json(response.body);
}
