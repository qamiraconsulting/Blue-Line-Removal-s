import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkAvailability } from "../../src/server/capacity/availability.js";
import {
  addBooking,
  cancelBooking,
  deleteOverride,
  listBookings,
  listOverrides,
  listTrucks,
  loadCapacity,
  loadSettings,
  melbourneNowLocal,
  saveOverride,
  saveSettings,
  saveTrip,
  saveTruck,
} from "../../src/server/capacity/store.js";
import { getDb } from "../../src/server/db/client.js";
import { bookings, quotes } from "../../src/server/db/schema.js";
import { describeProblem } from "../../src/lib/truckTrips.js";
import { truckIds } from "../../src/server/quote/rateCard.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Dashboard "Bookings & capacity": what the Blue Line team keeps up to date so the chat can
// offer free arrival times and (only when switched on) confirm bookings instantly. One
// function for every action (Vercel's Hobby plan allows 12 per deployment).
//   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD  -> settings, trucks, day changes, bookings
//        &tripDay=YYYY-MM-DD             -> plus that day's calendar (the Truck trips view)
//   POST { action, ... }                 -> save / add / cancel

const time = z.string().regex(/^\d{2}:\d{2}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0).max(1000).nullable();

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveSettings"),
    settings: z.object({
      autoConfirm: z.boolean(),
      workingDays: z.array(z.number().int().min(0).max(6)).max(7),
      arrivalTimes: z.array(time).max(12),
      dayEndTime: time.nullable(),
      bufferMinutes: count,
      moversPerDay: count,
      minNoticeHours: count,
      maxDaysAhead: count,
      autoConfirmMaxAud: z.number().int().min(0).max(100000).nullable(),
    }),
  }),
  z.object({
    action: z.literal("saveTruck"),
    truck: z.object({
      id: z.string().uuid().optional(),
      label: z.string().trim().min(1).max(80),
      truckType: z.enum(truckIds),
      active: z.boolean(),
      notes: z.string().max(300).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("saveOverride"),
    override: z.object({
      date: day,
      closed: z.boolean(),
      moversAvailable: count,
      trucksUnavailable: z.array(z.string().uuid()).max(50),
      note: z.string().max(300).nullable(),
    }),
  }),
  z.object({ action: z.literal("deleteOverride"), date: day }),
  z.object({
    action: z.literal("addBooking"),
    booking: z.object({
      source: z.enum(["phone", "airtasker", "moval", "other"]),
      date: day,
      arrivalTime: time,
      estimatedMinutes: z.number().int().min(30).max(24 * 60),
      truckType: z.enum(truckIds),
      truckId: z.string().uuid().nullable(),
      movers: z.number().int().min(1).max(20),
      customerName: z.string().max(200).nullable(),
      phone: z.string().max(50).nullable(),
      fromText: z.string().max(200).nullable(),
      toText: z.string().max(200).nullable(),
      notes: z.string().max(500).nullable(),
    }),
  }),
  z.object({ action: z.literal("cancelBooking"), id: z.string().uuid() }),
  z.object({
    action: z.literal("saveTrip"),
    trip: z.object({
      id: z.string().uuid().optional(),
      truckId: z.string().uuid(),
      date: day,
      start: time,
      end: time,
      movers: z.number().int().min(1).max(20),
      driverName: z.string().trim().max(100).nullable(),
      customerName: z.string().trim().max(200).nullable(),
      phone: z.string().trim().max(50).nullable(),
      customerEmail: z.string().trim().email().max(200).nullable(),
      fromText: z.string().trim().max(200).nullable(),
      toText: z.string().trim().max(200).nullable(),
      notes: z.string().trim().max(500).nullable(),
    }),
  }),
]);

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await guardAdmin(req, res);
  if (!admin) return;

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database isn't configured yet." });
    return;
  }

  try {
    if (req.method === "GET") {
      const today = melbourneNowLocal(new Date()).slice(0, 10);
      const from = typeof req.query.from === "string" && day.safeParse(req.query.from).success ? req.query.from : today;
      const to = typeof req.query.to === "string" && day.safeParse(req.query.to).success ? req.query.to : addDays(from, 30);
      const tripDay = typeof req.query.tripDay === "string" && day.safeParse(req.query.tripDay).success ? req.query.tripDay : today;
      const [settings, truckRows, overrides, calendar, dayTrips] = await Promise.all([
        loadSettings(),
        listTrucks(),
        listOverrides(today, addDays(today, 366)),
        listBookings(from, to),
        listBookings(tripDay, tripDay),
      ]);
      res.status(200).json({ today, nowTime: melbourneNowLocal(new Date()).slice(11), from, to, settings, trucks: truckRows, overrides, bookings: calendar, tripDay, dayTrips });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Some of those details aren't valid.", issues: parsed.error.issues.map((i) => i.path.join(".")) });
      return;
    }
    const body = parsed.data;

    switch (body.action) {
      case "saveSettings":
        await saveSettings({ ...body.settings, arrivalTimes: [...new Set(body.settings.arrivalTimes)].sort() }, admin.userId);
        break;
      case "saveTruck":
        await saveTruck(body.truck);
        break;
      case "saveOverride":
        await saveOverride(body.override);
        break;
      case "deleteOverride":
        await deleteOverride(body.date);
        break;
      case "addBooking": {
        // The team decides, but flag it if the calendar doesn't show room.
        const b = body.booking;
        const check = checkAvailability(
          { date: b.date, truckType: b.truckType, movers: b.movers, estimatedMinutes: b.estimatedMinutes, amountAud: 0 },
          { ...(await loadCapacity(b.date)), nowLocal: "1970-01-01T00:00", settings: { ...(await loadSettings()), arrivalTimes: [b.arrivalTime], minNoticeHours: 0, maxDaysAhead: null } },
        );
        const slot = check.slots[0];
        await addBooking({ ...b, truckId: b.truckId ?? slot?.truckId ?? null, status: "confirmed", createdBy: admin.userId });
        res.status(200).json({ ok: true, capacityWarning: !check.dayOpen ? check.dayReason : slot?.available ? null : (slot?.reason ?? null) });
        return;
      }
      case "saveTrip": {
        const saved = await saveTrip(body.trip, admin.userId);
        if (!saved.ok) {
          res.status(409).json({ error: describeProblem(saved.problem, saved.truckName) });
          return;
        }
        res.status(200).json({ ok: true, id: saved.id });
        return;
      }
      case "cancelBooking": {
        const [row] = await getDb().select({ quoteReference: bookings.quoteReference }).from(bookings).where(eq(bookings.id, body.id)).limit(1);
        await cancelBooking(body.id);
        // Keep the job's status in step with the calendar.
        if (row?.quoteReference) {
          await getDb()
            .update(quotes)
            .set({ bookingStatus: "cancelled", jobStatus: "cancelled", statusUpdatedAt: new Date(), closedReason: "Cancelled on the calendar", closedBy: admin.userId })
            .where(eq(quotes.reference, row.quoteReference));
        }
        break;
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Capacity admin failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't save that just now." });
  }
}
