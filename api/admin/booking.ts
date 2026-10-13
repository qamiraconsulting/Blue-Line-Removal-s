import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { confirmBooking, dbBookingStore } from "../../src/server/quote/booking.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Dashboard: confirm a booking request the customer made in the chat (they agreed to book on
// the estimate, with final charges confirmed at the move-day inspection). Adds it to the
// booking calendar and emails the customer. The team may confirm even when the calendar
// doesn't show room -- the response then carries a capacityWarning.
const bodySchema = z.object({
  reference: z.string().min(4).max(40),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  truckId: z.string().uuid().nullable().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const admin = await guardAdmin(req, res);
  if (!admin) return;

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
    const result = await confirmBooking({ ...parsed.data, confirmedBy: admin.userId }, { ...deps, bookings: dbBookingStore });
    res.status(result.ok ? 200 : 409).json(result.ok ? result : { error: result.error });
  } catch (err) {
    console.error("Booking confirmation failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't confirm that booking just now." });
  }
}
