import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { confirmBooking, dbBookingStore } from "../../src/server/quote/booking.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Dashboard: confirm a booking request the customer made in the chat (they agreed to book on
// the estimate, with final charges confirmed at the move-day inspection). Emails the customer.
const bodySchema = z.object({ reference: z.string().min(4).max(40) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!(await guardAdmin(req, res))) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const deps = buildQuoteDeps();
  if (!deps || !process.env.DATABASE_URL) {
    res.status(500).json({ error: "Email or database isn't configured yet." });
    return;
  }

  try {
    const result = await confirmBooking(parsed.data.reference, { ...deps, bookings: dbBookingStore });
    res.status(result.ok ? 200 : 409).json(result.ok ? result : { error: result.error });
  } catch (err) {
    console.error("Booking confirmation failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't confirm that booking just now." });
  }
}
