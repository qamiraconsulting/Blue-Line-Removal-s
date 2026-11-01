import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { availabilityForQuote, dbBookingStore, requestBooking } from "../src/server/quote/booking.js";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION } from "../src/server/quote/bookingEmails.js";
import { buildQuoteDeps } from "../src/server/quote/deps.js";
import { checkQuoteRateLimit } from "../src/server/services/rateLimit.js";

// The website quote form books the estimate it just showed (Ayesha, 2026-10-15): same booking
// terms and the same rules as the chat (src/server/quote/booking.ts). The page proves it's the
// same customer with the bookingToken that came back with their estimate.
//   GET  ?reference=&token=  -> the booking terms + free arrival times for that estimate
//   POST { reference, token, agreedToTerms: true, arrivalTime?, notes? } -> booking request
//        (or booked on the spot, when the team has switched instant confirmation on)

const ref = z.string().trim().min(4).max(40);
const token = z.string().regex(/^[a-f0-9]{32}$/);
const postSchema = z.object({
  reference: ref,
  token,
  agreedToTerms: z.literal(true),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});

// The booking module's messages are written for the chat assistant; these are for customers.
const FOR_CUSTOMER: Record<string, string> = {
  not_found: "We couldn't find that estimate. Please get a new one, or call us.",
  no_estimate: "This job needs a personal quote — our team will be in touch to arrange it.",
  expired: "That estimate has expired. Please get a fresh estimate, then book.",
  time_unavailable: "That arrival time has just been taken — please pick another.",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const deps = buildQuoteDeps();
  if (!deps || !process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: "Online booking isn't available right now — please call us instead." });
    return;
  }
  const bookingDeps = { ...deps, bookings: dbBookingStore };

  try {
    if (req.method === "GET") {
      const reference = ref.safeParse(req.query.reference);
      const bookingToken = token.safeParse(req.query.token);
      if (!reference.success || !bookingToken.success) {
        res.status(400).json({ ok: false, error: "That estimate can't be booked online." });
        return;
      }
      const availability = await availabilityForQuote({ reference: reference.data, bookingToken: bookingToken.data }, bookingDeps);
      if (!availability.ok) {
        res.status(availability.reason === "not_found" ? 404 : 409).json({ ok: false, error: FOR_CUSTOMER[availability.reason] ?? availability.error, reason: availability.reason });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ ...availability, terms: BOOKING_TERMS, termsVersion: BOOKING_TERMS_VERSION });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "unknown";
    if (!(await checkQuoteRateLimit(ip)).allowed) {
      res.status(429).json({ ok: false, error: "Too many requests. Please wait a few minutes and try again." });
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Please tick the box to agree to the booking terms." });
      return;
    }
    const { reference, token: bookingToken, arrivalTime, notes } = parsed.data;
    const result = await requestBooking({ reference, bookingToken, arrivalTime, notes }, bookingDeps);
    if (!result.ok) {
      res.status(409).json({ ok: false, error: FOR_CUSTOMER[result.reason] ?? result.error, reason: result.reason, availableTimes: result.availableTimes ?? [] });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error("Form booking failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ ok: false, error: "We couldn't take that booking just now. Please call us instead." });
  }
}
