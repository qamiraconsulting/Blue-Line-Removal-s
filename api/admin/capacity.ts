import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkAvailability } from "../../src/server/capacity/availability.js";
import {
  addBooking,
  cancelBooking,
  deleteOverride,
  listBookings,
  listDrivers,
  listOverrides,
  listTrucks,
  loadCapacity,
  loadSettings,
  melbourneNowLocal,
  saveOverride,
  saveDriver,
  saveSettings,
  saveTrip,
  saveTruck,
  upcomingBookingIdsForTruck,
} from "../../src/server/capacity/store.js";
import { driverNoticeLine } from "../../src/server/notify/driverNotice.js";
import { renderManualBookingEmail } from "../../src/server/quote/bookingEmails.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { customerRecipient } from "../../src/server/quote/service.js";
import { site } from "../../src/data/site.js";
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
      /** The truck's usual driver. */
      driverId: z.string().uuid().nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("saveDriver"),
    driver: z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().max(50).nullable(),
      email: z.string().trim().email().max(200).nullable(),
      active: z.boolean(),
      notes: z.string().trim().max(300).nullable().optional(),
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
      customerEmail: z.string().trim().email().max(200).nullable().optional(),
      fromText: z.string().max(200).nullable(),
      toText: z.string().max(200).nullable(),
      notes: z.string().max(500).nullable(),
    }),
    /** Email the customer a booking confirmation (needs their email). */
    notifyCustomer: z.boolean().optional(),
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
      /** Someone covering this one trip; null = the truck's usual driver. */
      driverId: z.string().uuid().nullable(),
      customerName: z.string().trim().max(200).nullable(),
      phone: z.string().trim().max(50).nullable(),
      customerEmail: z.string().trim().email().max(200).nullable(),
      fromText: z.string().trim().max(200).nullable(),
      toText: z.string().trim().max(200).nullable(),
      notes: z.string().trim().max(500).nullable(),
    }),
    /** Email the customer: a confirmation for a new trip, or the new time for a moved one. */
    notifyCustomer: z.boolean().optional(),
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
      const [settings, truckRows, driverRows, overrides, calendar, dayTrips] = await Promise.all([
        loadSettings(),
        listTrucks(),
        listDrivers(),
        listOverrides(today, addDays(today, 366)),
        listBookings(from, to),
        listBookings(tripDay, tripDay),
      ]);
      res.status(200).json({ today, nowTime: melbourneNowLocal(new Date()).slice(11), from, to, settings, trucks: truckRows, drivers: driverRows, overrides, bookings: calendar, tripDay, dayTrips });
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
    // Email: the truck's driver, and (when the team ticks it) the customer. Null if email isn't set up.
    const mail = buildQuoteDeps();
    const notices: string[] = [];
    const tellDriver = async (target: { bookingId: string }, driverName?: string | null) => {
      const line = driverNoticeLine(await mail?.notifyDriver?.(target), driverName);
      if (line) notices.push(line);
    };
    /** Customers are only emailed from production; the test link sends to the test inbox (or nowhere). */
    const tellCustomer = async (
      to: string | null | undefined,
      mailInput: Parameters<typeof renderManualBookingEmail>[0],
    ) => {
      if (!to) return;
      const address = customerRecipient(to, process.env.VERCEL_ENV !== "production", mail?.testEmailTo);
      if (!mail || !address) {
        notices.push("Customer NOT emailed: this is the test link, so customer emails aren't sent.");
        return;
      }
      const content = renderManualBookingEmail(mailInput);
      const sent = await mail
        .sendEmail({ ...content, subject: address === to ? content.subject : `[TEST] ${content.subject}`, to: address, replyTo: site.email, kind: "customer" })
        .catch(() => false);
      notices.push(sent ? "Customer emailed." : "Customer NOT emailed: the email couldn't be sent.");
    };

    switch (body.action) {
      case "saveSettings":
        await saveSettings({ ...body.settings, arrivalTimes: [...new Set(body.settings.arrivalTimes)].sort() }, admin.userId);
        break;
      case "saveTruck": {
        const saved = await saveTruck(body.truck);
        if (!saved.ok) {
          res.status(409).json({ error: saved.error });
          return;
        }
        // A new usual driver takes over the truck's upcoming bookings, and is told about them
        // (the old one is told they're off them).
        if (saved.usualDriverChanged) {
          const upcoming = await upcomingBookingIdsForTruck(saved.id, melbourneNowLocal(new Date()).slice(0, 10));
          const results = [];
          for (const id of upcoming) results.push(await mail?.notifyDriver?.({ bookingId: id }));
          const sent = results.filter((r) => r?.status === "sent").length;
          if (upcoming.length) notices.push(`${upcoming.length} upcoming job${upcoming.length === 1 ? "" : "s"} on this truck moved to the new driver (${sent} email${sent === 1 ? "" : "s"} sent).`);
        }
        break;
      }
      case "saveDriver": {
        const saved = await saveDriver(body.driver);
        if (!saved.ok) {
          res.status(409).json({ error: saved.error });
          return;
        }
        break;
      }
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
        const id = await addBooking({ ...b, customerEmail: b.customerEmail ?? null, truckId: b.truckId ?? slot?.truckId ?? null, status: "confirmed", createdBy: admin.userId });
        await tellDriver({ bookingId: id });
        if (body.notifyCustomer) await tellCustomer(b.customerEmail, { name: b.customerName, kind: "confirmed", date: b.date, arrivalTime: b.arrivalTime, from: b.fromText, to: b.toText });
        res.status(200).json({ ok: true, notices, capacityWarning: !check.dayOpen ? check.dayReason : slot?.available ? null : (slot?.reason ?? null) });
        return;
      }
      case "saveTrip": {
        const saved = await saveTrip(body.trip, admin.userId);
        if (!saved.ok) {
          res.status(409).json({ error: describeProblem(saved.problem, saved.truckName) });
          return;
        }
        await tellDriver({ bookingId: saved.id });
        const t = body.trip;
        if (body.notifyCustomer && (saved.created || saved.rescheduled)) {
          await tellCustomer(t.customerEmail, { name: t.customerName, kind: saved.created ? "confirmed" : "rescheduled", date: t.date, arrivalTime: t.start, from: t.fromText, to: t.toText });
        }
        res.status(200).json({ ok: true, id: saved.id, notices });
        return;
      }
      case "cancelBooking": {
        const [row] = await getDb().select({ quoteReference: bookings.quoteReference }).from(bookings).where(eq(bookings.id, body.id)).limit(1);
        await cancelBooking(body.id);
        await tellDriver({ bookingId: body.id });
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
    res.status(200).json({ ok: true, notices });
  } catch (err) {
    console.error("Capacity admin failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't save that just now." });
  }
}
