import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildQuoteDeps } from "../src/server/quote/deps.js";
import { handleQuoteRequest } from "../src/server/quote/service.js";
import { checkQuoteRateLimit } from "../src/server/services/rateLimit.js";

// The website quote form: validates, works out the driving distance, prices the job with
// the flat-price engine (src/server/quote), stores the quote, emails the customer their
// price and notifies the team. The chat's get_quote tool runs this same flow.
//
// If the database or Google key isn't configured it degrades to the old behaviour: the
// lead still reaches the team and the customer is told we'll send the quote -- it never
// guesses a price. Environment variables: see src/server/quote/deps.ts and .env.example.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const deps = buildQuoteDeps();
  if (!deps) {
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

  const response = await handleQuoteRequest(req.body, deps, { source: "quote_form" });
  res.status(response.status).json(response.body);
}
