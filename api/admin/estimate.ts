import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { quickEstimate } from "../../src/server/quote/calculator.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { homeSizeIds, truckIds } from "../../src/server/quote/rateCard.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// "+ New job" -> Quick estimate: the price for a move confirmed on the call, from the same engine
// as the chat (home-size guide hours + the Google Maps drive, the approved price list, rounded to
// $10). Full and limited users (Matt) can both use it. See src/server/quote/calculator.ts.
//   POST { from, to, propertySize, truck, movers, movingDate, pickup/dropoff access, heavyItems, newCustomer }

const flights = z.coerce.number().int().min(0).max(20);
const bodySchema = z.object({
  from: z.string().trim().min(3).max(300),
  to: z.string().trim().min(3).max(300),
  propertySize: z.enum(homeSizeIds),
  truck: z.enum(truckIds),
  movers: z.coerce.number().int().min(1).max(10),
  movingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupApartment: z.boolean(),
  pickupStairFlights: flights,
  pickupParkingOver50m: z.boolean(),
  dropoffApartment: z.boolean(),
  dropoffStairFlights: flights,
  dropoffParkingOver50m: z.boolean(),
  heavyItems: z.coerce.number().int().min(0).max(30),
  newCustomer: z.boolean(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await guardAdmin(req, res))) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Fill in both addresses, the home size, truck and the move date.", issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return;
  }
  const deps = buildQuoteDeps();
  if (!deps?.routes) {
    res.status(500).json({ error: "Google Maps isn't configured, so the drive can't be worked out." });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await quickEstimate(parsed.data, { rateCard: deps.rateCard, routes: deps.routes, cache: deps.cache }));
  } catch (err) {
    console.error("Quick estimate failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't work out the estimate just now. Please try again." });
  }
}
