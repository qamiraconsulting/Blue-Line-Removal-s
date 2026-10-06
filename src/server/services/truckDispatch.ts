import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { leads } from "../db/schema.js";

// Confirmed 2026-08-21: the truck's starting point for a call-out
// calculation is derived from data the system already has, never asked of
// the customer. First job of each day starts from the Tarneit depot
// (confirmed -- trucks return there at day's end); every job after that
// starts from the previous booking's drop-off address.
//
// KNOWN LIMITATION: same-day ordering below falls back to `updatedAt` as a
// proxy for "which job happened first today," because `moving_time` is
// free text (e.g. "morning", "2pm"), not a structured, sortable time.
// That's fine for a single-truck MVP where bookings are naturally
// confirmed in dispatch order, but it isn't a reliable general solution --
// worth a real `scheduled_start` timestamp column before this matters for
// multiple trucks or out-of-order confirmations. Flagged, not silently
// assumed solid.

export interface TruckLocation {
  address: string;
  isDepot: boolean;
}

/**
 * Returns where the truck is starting from for a job scheduled on
 * `movingDate`. Only same-day confirmed bookings count as "already out" --
 * a booking from a prior day never carries over, since the truck returns
 * to Tarneit each night.
 */
export async function getTruckStartingLocation(movingDate: string, depotAddress: string): Promise<TruckLocation> {
  const db = getDb();

  const priorBookingsToday = await db
    .select({ destinationAddressFormatted: leads.destinationAddressFormatted })
    .from(leads)
    .where(
      and(
        eq(leads.status, "confirmed_booking"),
        eq(leads.movingDate, movingDate),
        isNotNull(leads.destinationAddressFormatted),
      ),
    )
    .orderBy(desc(leads.updatedAt))
    .limit(1);

  const prior = priorBookingsToday[0];
  if (prior?.destinationAddressFormatted) {
    return { address: prior.destinationAddressFormatted, isDepot: false };
  }
  return { address: depotAddress, isDepot: true };
}
