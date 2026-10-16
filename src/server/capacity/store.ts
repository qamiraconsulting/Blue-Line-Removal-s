import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { tripProblem, toMinutes, type TripProblem } from "../../lib/truckTrips.js";
import { bookingSettings, bookings, dayOverrides, quotes, trucks } from "../db/schema.js";
import type { CalendarBooking, CapacitySettings, CapacitySnapshot, CapacityTruck, DayOverride } from "./availability.js";

// Database access for bookings & capacity (dashboard + chat). The chat only ever reads
// capacity and adds bookings through reserve(), which locks the date so two customers can't
// take the last truck at the same moment.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export const EMPTY_SETTINGS: CapacitySettings = {
  autoConfirm: false,
  workingDays: [],
  arrivalTimes: [],
  dayEndTime: null,
  bufferMinutes: null,
  moversPerDay: null,
  minNoticeHours: null,
  maxDaysAhead: null,
  autoConfirmMaxAud: null,
};

/** Melbourne wall-clock "YYYY-MM-DDTHH:MM". */
export function melbourneNowLocal(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export async function loadSettings(conn: Conn = getDb()): Promise<CapacitySettings> {
  const [row] = await conn.select().from(bookingSettings).where(eq(bookingSettings.id, 1)).limit(1);
  if (!row) return EMPTY_SETTINGS;
  const { id: _id, updatedAt: _u, updatedBy: _b, ...settings } = row;
  return settings;
}

export async function loadCapacity(date: string, conn: Conn = getDb()): Promise<Omit<CapacitySnapshot, "nowLocal">> {
  const [settings, truckRows, [override], dayBookings] = await Promise.all([
    loadSettings(conn),
    conn.select({ id: trucks.id, truckType: trucks.truckType, active: trucks.active }).from(trucks),
    conn.select().from(dayOverrides).where(eq(dayOverrides.date, date)).limit(1),
    conn
      .select({
        arrivalTime: bookings.arrivalTime,
        estimatedMinutes: bookings.estimatedMinutes,
        truckType: bookings.truckType,
        truckId: bookings.truckId,
        movers: bookings.movers,
      })
      .from(bookings)
      .where(and(eq(bookings.date, date), eq(bookings.status, "confirmed"))),
  ]);
  return {
    settings,
    trucks: truckRows as CapacityTruck[],
    override: override ? ({ closed: override.closed, moversAvailable: override.moversAvailable, trucksUnavailable: override.trucksUnavailable } as DayOverride) : null,
    bookings: dayBookings as CalendarBooking[],
  };
}

export type NewCalendarBooking = typeof bookings.$inferInsert;

/**
 * Adds a booking to the calendar while holding a lock on its date. `decide` sees the day's
 * capacity as it is inside the lock and returns the booking to insert (with any truck it
 * picked), or null to back out.
 */
export async function reserve<T>(
  date: string,
  decide: (capacity: Omit<CapacitySnapshot, "nowLocal">) => { booking: NewCalendarBooking; result: T } | null,
  after: (tx: Tx, result: T) => Promise<void>,
): Promise<T | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`blr-booking-${date}`}))`);
    const decision = decide(await loadCapacity(date, tx));
    if (!decision) return null;
    await tx.insert(bookings).values(decision.booking);
    await after(tx, decision.result);
    return decision.result;
  });
}

// ---------------------------------------------------------------- dashboard reads/writes

export async function saveSettings(settings: CapacitySettings, updatedBy: string) {
  await getDb()
    .insert(bookingSettings)
    .values({ id: 1, ...settings, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: bookingSettings.id, set: { ...settings, updatedBy, updatedAt: new Date() } });
}

export const listTrucks = () => getDb().select().from(trucks).orderBy(asc(trucks.truckType), asc(trucks.label));

export async function saveTruck(truck: { id?: string; label: string; truckType: string; active: boolean; notes?: string | null }) {
  const db = getDb();
  if (truck.id) {
    await db.update(trucks).set({ label: truck.label, truckType: truck.truckType, active: truck.active, notes: truck.notes ?? null }).where(eq(trucks.id, truck.id));
  } else {
    await db.insert(trucks).values({ label: truck.label, truckType: truck.truckType, active: truck.active, notes: truck.notes ?? null });
  }
}

export const listOverrides = (from: string, to: string) =>
  getDb().select().from(dayOverrides).where(and(gte(dayOverrides.date, from), lte(dayOverrides.date, to))).orderBy(asc(dayOverrides.date));

export async function saveOverride(o: { date: string; closed: boolean; moversAvailable: number | null; trucksUnavailable: string[]; note: string | null }) {
  await getDb()
    .insert(dayOverrides)
    .values({ ...o, updatedAt: new Date() })
    .onConflictDoUpdate({ target: dayOverrides.date, set: { ...o, updatedAt: new Date() } });
}

export const deleteOverride = (date: string) => getDb().delete(dayOverrides).where(eq(dayOverrides.date, date));

export const listBookings = (from: string, to: string) =>
  getDb()
    .select()
    .from(bookings)
    .where(and(gte(bookings.date, from), lte(bookings.date, to)))
    .orderBy(asc(bookings.date), asc(bookings.arrivalTime));

export const addBooking = (b: NewCalendarBooking) => getDb().insert(bookings).values(b);

export interface TripInput {
  id?: string;
  truckId: string;
  date: string;
  start: string;
  end: string;
  movers: number;
  customerName: string | null;
  notes: string | null;
}

export type SaveTripResult = { ok: true; id: string } | { ok: false; problem: TripProblem; truckName: string };

/**
 * Adds or edits a truck trip. Holds the same date lock as the chat's bookings, so the chat
 * and the team can't put the same truck out twice at the same moment. Editing a trip that
 * belongs to a customer's job also moves the job's date and arrival time.
 */
export async function saveTrip(trip: TripInput, by: string): Promise<SaveTripResult> {
  return getDb().transaction(async (tx) => {
    const [before] = trip.id ? await tx.select().from(bookings).where(eq(bookings.id, trip.id)).limit(1) : [];
    if (trip.id && !before) throw new Error("Trip not found");
    // Lock the new date, and the old one when the trip moves day.
    for (const d of [...new Set([trip.date, before?.date].filter(Boolean) as string[])].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`blr-booking-${d}`}))`);
    }

    const [truck] = await tx.select().from(trucks).where(eq(trucks.id, trip.truckId)).limit(1);
    if (!truck) throw new Error("Truck not found");
    const [override] = await tx.select().from(dayOverrides).where(eq(dayOverrides.date, trip.date)).limit(1);
    const sameDay = await tx
      .select({ id: bookings.id, truckId: bookings.truckId, date: bookings.date, arrivalTime: bookings.arrivalTime, estimatedMinutes: bookings.estimatedMinutes, status: bookings.status, customerName: bookings.customerName, quoteReference: bookings.quoteReference, notes: bookings.notes })
      .from(bookings)
      .where(and(eq(bookings.date, trip.date), eq(bookings.status, "confirmed")));
    const problem = tripProblem({ id: trip.id, truckId: trip.truckId, date: trip.date, start: trip.start, end: trip.end }, sameDay, override?.trucksUnavailable ?? []);
    if (problem) return { ok: false, problem, truckName: truck.label };

    const fields = {
      date: trip.date,
      arrivalTime: trip.start,
      estimatedMinutes: toMinutes(trip.end) - toMinutes(trip.start),
      truckId: truck.id,
      truckType: truck.truckType,
      movers: trip.movers,
      customerName: trip.customerName,
      notes: trip.notes,
    };
    if (before) {
      await tx.update(bookings).set(fields).where(eq(bookings.id, before.id));
      if (before.quoteReference && (before.date !== trip.date || before.arrivalTime !== trip.start)) {
        await tx.update(quotes).set({ movingDate: trip.date, bookingArrivalTime: trip.start }).where(eq(quotes.reference, before.quoteReference));
      }
      return { ok: true, id: before.id };
    }
    const [row] = await tx
      .insert(bookings)
      .values({ ...fields, source: "other", status: "confirmed", createdBy: by })
      .returning({ id: bookings.id });
    return { ok: true, id: row!.id };
  });
}

export const cancelBooking = (id: string) =>
  getDb().update(bookings).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(bookings.id, id));
