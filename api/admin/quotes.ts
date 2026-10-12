import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client.js";
import { quotes } from "../../src/server/db/schema.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Recent quotes from the form and the chat, for Blue Line staff. ?status=manual_review shows
// only the ones waiting for a personal quote; ?booking=requested the booking requests waiting
// for confirmation. Includes the internal breakdown (staff only).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!(await guardAdmin(req, res))) return;

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database isn't configured yet." });
    return;
  }

  const status = req.query.status === "priced" || req.query.status === "manual_review" ? req.query.status : null;
  const booking = req.query.booking === "requested" || req.query.booking === "confirmed" ? req.query.booking : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  try {
    const rows = await getDb()
      .select({
        reference: quotes.reference,
        createdAt: quotes.createdAt,
        source: quotes.source,
        conversationId: quotes.conversationId,
        status: quotes.status,
        manualReason: quotes.manualReason,
        customerName: quotes.customerName,
        phone: quotes.phone,
        email: quotes.email,
        need: quotes.need,
        truck: quotes.truck,
        movers: quotes.movers,
        accessNotes: quotes.accessNotes,
        movingDate: quotes.movingDate,
        fromText: quotes.fromText,
        toText: quotes.toText,
        firstMoveApplied: quotes.firstMoveApplied,
        amountAud: quotes.amountAud,
        validUntil: quotes.validUntil,
        rateCardVersion: quotes.rateCardVersion,
        rateCardStatus: quotes.rateCardStatus,
        internalBreakdown: quotes.internalBreakdown,
        customerEmailSentAt: quotes.customerEmailSentAt,
        bookingStatus: quotes.bookingStatus,
        bookingRequestedAt: quotes.bookingRequestedAt,
        bookingNotes: quotes.bookingNotes,
      })
      .from(quotes)
      .where(and(status ? eq(quotes.status, status) : undefined, booking ? eq(quotes.bookingStatus, booking) : undefined))
      .orderBy(desc(quotes.createdAt))
      .limit(limit);
    res.status(200).json({ quotes: rows });
  } catch (err) {
    console.error("Admin quotes fetch failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't load quotes just now." });
  }
}
