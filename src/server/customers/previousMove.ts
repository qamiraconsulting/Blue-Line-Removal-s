import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { quotes } from "../db/schema.js";
import { normalisePhone } from "../quote/service.js";

// New or returning customer? One rule for every channel (chat, website form, Matt's Google
// Form), so the 10% first-booking offer is decided the same way everywhere (Ayesha, 2026-10-25):
//
//   RETURNING = this email OR this phone already has a booked or completed job with Blue Line.
//   NEW       = everyone else. A quote that was never booked, or a cancelled job, doesn't count,
//               so asking twice never loses the offer.
//
// The job being quoted right now never counts against itself: its own booking number / website
// reference is left out, and so is any booking for the same customer on the same move date (Matt
// re-sending the same job as a new form response is still the same job).

export interface PreviousMove {
  reference: string;
  movingDate: string | null;
  status: string;
}

export interface PreviousMoveQuery {
  email: string;
  phone: string;
  /** References or sheet booking numbers of the job being quoted now. */
  excludeReferences?: string[];
  /** The move date of the job being quoted now (yyyy-mm-dd). */
  sameJobDate?: string | null;
}

/** The email and phone we can safely match on -- a blank or junk value matches nothing. */
export function customerKeys(email: string, phone: string): { email: string | null; phone: string | null } {
  const e = email.trim().toLowerCase();
  const p = normalisePhone(phone);
  return { email: /^[^@\s]+@[^@\s]+$/.test(e) ? e : null, phone: p.length >= 8 ? p : null };
}

/** The customer's most recent earlier booked/completed job, or null if they're a new customer. */
export async function findPreviousMove(q: PreviousMoveQuery): Promise<PreviousMove | null> {
  const keys = customerKeys(q.email, q.phone);
  const who = [keys.email && eq(quotes.emailNormalised, keys.email), keys.phone && eq(quotes.phoneNormalised, keys.phone)].filter(
    (c): c is SQL => Boolean(c),
  );
  if (who.length === 0) return null;

  const exclude = (q.excludeReferences ?? []).map((r) => r.trim().toUpperCase()).filter(Boolean);
  const conditions: (SQL | undefined)[] = [inArray(quotes.jobStatus, ["booked", "completed"]), or(...who)];
  if (exclude.length) {
    conditions.push(notInArray(quotes.reference, exclude));
    conditions.push(or(isNull(quotes.externalRef), notInArray(quotes.externalRef, exclude)));
  }
  if (q.sameJobDate) conditions.push(or(isNull(quotes.movingDate), ne(quotes.movingDate, q.sameJobDate)));

  const [row] = await getDb()
    .select({ reference: quotes.reference, externalRef: quotes.externalRef, movingDate: quotes.movingDate, status: quotes.jobStatus })
    .from(quotes)
    .where(and(...conditions))
    .orderBy(sql`${quotes.movingDate} desc nulls last`, desc(quotes.createdAt))
    .limit(1);
  return row ? { reference: row.externalRef ?? row.reference, movingDate: row.movingDate, status: row.status } : null;
}
