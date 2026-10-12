import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "drizzle-orm";
import { getDb } from "../src/server/db/client.js";
import { getActiveRateCard } from "../src/server/quote/rateCard.js";

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
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('conversations','messages','leads','quotes','distance_cache')`,
      );
      database = rows[0]?.n === 5 ? "ok" : "tables_missing";
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
    teamInbox: env.LEAD_TO_EMAIL ? "set" : "default (Qamira)",
    distances: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
    chatAssistant: Boolean(env.ANTHROPIC_API_KEY),
    adminDashboard: Boolean(env.CLERK_SECRET_KEY) && Boolean(env.ADMIN_USER_IDS?.trim()),
    rateLimiting: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    rateCard: { version: rateCard.version, status: rateCard.status },
    testPrices: env.QUOTE_ALLOW_PLACEHOLDER === "true" && env.VERCEL_ENV !== "production",
  });
}
