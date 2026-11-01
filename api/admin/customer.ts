import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { checkCustomer } from "../../src/server/intake/customerCheck.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// "+ New job" → Verify: has this customer moved with us before? The same check (and the same
// new/returning rule) Matt's Google Form uses to decide the 10% first-booking discount, so the
// answer here matches what his quote will get. Full and limited users (Matt) can both use it.
//   GET ?email=  -> { customerType: "new" | "returning", lastMove, discountPercent }

const email = z.string().trim().email().max(320);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await guardAdmin(req, res))) return;

  const parsed = email.safeParse(req.query.email);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the customer's email address." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database isn't configured yet." });
    return;
  }
  try {
    const result = await checkCustomer({ action: "customerCheck", email: parsed.data, phone: "" });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      customerType: result.customerType,
      lastMove: result.previousMove ? { date: result.previousMove.movingDate, reference: result.previousMove.reference } : null,
      discountPercent: result.discountPercent,
    });
  } catch (err) {
    console.error("Customer check failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't check that customer just now. Please try again." });
  }
}
