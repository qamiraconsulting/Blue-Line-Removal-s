import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "drizzle-orm";
import { getDb } from "../src/server/db/client.js";
import { getActiveRateCard } from "../src/server/quote/rateCard.js";
import { isTestKey } from "../src/server/payments/stripe.js";

// Setup check for Qamira: open /api/health on a deployment to see which pieces are
// configured. Reports yes/no only -- never a key, address or connection string.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = process.env;
  let database: "ok" | "not_configured" | "unreachable" | "tables_missing" = "not_configured";
  if (env.DATABASE_URL) {
    try {
      const rows = await getDb().execute<{ n: number }>(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('conversations','messages','leads','quotes','distance_cache','booking_settings','trucks','day_overrides','bookings','drivers')`,
      );
      database = rows[0]?.n === 10 ? "ok" : "tables_missing";
    } catch {
      database = "unreachable";
    }
  }

  const rateCard = getActiveRateCard();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    environment: env.VERCEL_ENV ?? "local",
    database,
    email: Boolean(env.RESEND_API_KEY && env.LEAD_FROM_EMAIL),
    teamInbox: env.LEAD_TO_EMAIL ? "set" : "default (hello@)",
    distances: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
    chatAssistant: Boolean(env.ANTHROPIC_API_KEY),
    adminDashboard: Boolean(env.CLERK_SECRET_KEY) && Boolean(env.ADMIN_USER_IDS?.trim() || env.ADMIN_EMAILS?.trim()),
    rateLimiting: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    // Branded PDF quotes + Matt's Google Form intake (the quote Apps Script).
    pdfQuotes: Boolean(env.APPS_SCRIPT_URL && env.APPS_SCRIPT_SECRET),
    googleFormIntake: Boolean(env.APPS_SCRIPT_SECRET),
    testInbox: Boolean(env.TEST_EMAIL_REDIRECT) && env.VERCEL_ENV !== "production",
    // The $100 booking deposit via Stripe: "test" / "live" keys, or false when not set up.
    deposits: env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET ? (isTestKey(env.STRIPE_SECRET_KEY.trim()) ? "test" : "live") : false,
    rateCard: { version: rateCard.version, status: rateCard.status },
    testPrices: env.QUOTE_ALLOW_PLACEHOLDER === "true" && env.VERCEL_ENV !== "production",
  });
}
