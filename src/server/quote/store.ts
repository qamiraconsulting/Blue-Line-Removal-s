import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { distanceCache, quotes } from "../db/schema.js";
import type { DistanceCache } from "./distance.js";

export type NewQuoteRow = typeof quotes.$inferInsert;

export interface QuoteStore {
  /**
   * True if this email or phone already has a booked or completed job with Blue Line (any
   * channel, incl. Matt's Google Form) -- i.e. not a first-time customer. Estimates and quotes
   * that were never booked don't count.
   */
  isReturningCustomer(emailNormalised: string, phoneNormalised: string): Promise<boolean>;
  /** Quotes from this email in the last `sinceMinutes` -- a simple abuse throttle. */
  recentQuoteCount(emailNormalised: string, sinceMinutes: number): Promise<number>;
  saveQuote(row: NewQuoteRow): Promise<void>;
  markCustomerEmailSent(reference: string): Promise<void>;
}

export const dbQuoteStore: QuoteStore = {
  async isReturningCustomer(emailNormalised, phoneNormalised) {
    const rows = await getDb()
      .select({ id: quotes.id })
      .from(quotes)
      .where(
        and(
          inArray(quotes.jobStatus, ["booked", "completed"]),
          or(eq(quotes.emailNormalised, emailNormalised), eq(quotes.phoneNormalised, phoneNormalised)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },

  async recentQuoteCount(emailNormalised, sinceMinutes) {
    const since = new Date(Date.now() - sinceMinutes * 60_000);
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(quotes)
      .where(and(eq(quotes.emailNormalised, emailNormalised), gte(quotes.createdAt, since)));
    return row?.n ?? 0;
  },

  async saveQuote(row) {
    await getDb().insert(quotes).values(row);
  },

  async markCustomerEmailSent(reference) {
    await getDb().update(quotes).set({ customerEmailSentAt: new Date() }).where(eq(quotes.reference, reference));
  },
};

export const dbDistanceCache: DistanceCache = {
  async get(originKey, destKey) {
    const [row] = await getDb()
      .select()
      .from(distanceCache)
      .where(and(eq(distanceCache.originKey, originKey), eq(distanceCache.destKey, destKey)))
      .limit(1);
    return row ? { meters: row.distanceMeters, seconds: row.durationSeconds } : null;
  },

  async put(originKey, destKey, value) {
    await getDb()
      .insert(distanceCache)
      .values({ originKey, destKey, distanceMeters: value.meters, durationSeconds: value.seconds })
      .onConflictDoNothing();
  },
};
