import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";

// The hourly job (vercel.json "crons"): sends the driver's "New job" email and the customer's
// booking email once their day-before has come (from 9am Melbourne time on the day before the
// move) -- see src/lib/noticeTiming.ts. Anything already sent is never repeated, so running
// it more often, or by hand, is harmless.
//
// Vercel calls this with "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET environment
// variable is set. Without it set, or with anything else, nothing runs. Vercel only runs cron
// jobs on the PRODUCTION deployment; on the test link use the dashboard's "Send due emails now".

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Not allowed" });
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const deps = buildQuoteDeps();
  if (!deps?.sendDueNotices) {
    res.status(500).json({ error: "Email or database isn't configured yet." });
    return;
  }
  try {
    const summary = await deps.sendDueNotices();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error("Day-before emails failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't send the day-before emails just now." });
  }
}
