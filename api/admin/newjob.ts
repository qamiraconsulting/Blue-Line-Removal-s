import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { saveTrip } from "../../src/server/capacity/store.js";
import { getDb } from "../../src/server/db/client.js";
import { bookings } from "../../src/server/db/schema.js";
import { saveTeamFormJob, type TeamFormJob } from "../../src/server/intake/teamForm.js";
import { teamQuote } from "../../src/server/jobs/lines.js";
import { customerNoticeLine } from "../../src/server/notify/customerNotice.js";
import { driverNoticeLine } from "../../src/server/notify/driverNotice.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { truckIds } from "../../src/server/quote/rateCard.js";
import { defaultReference } from "../../src/server/quote/service.js";
import { describeProblem, fromMinutes, toMinutes } from "../../src/lib/truckTrips.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// The new dashboard's "New job" form: a phone, Airtasker, Moval or other job, in one form
// (it replaces "Assign a truck to a trip" and "Add a booking by hand"). It is saved the same
// way as Matt's Google Form (saveTeamFormJob), so it gets a status and shows on every list:
//   - quote: saved as "waiting for quote"; the team sends the quote from the job page (PDF email).
//   - book:  priced with the rate card (or the team's total), booked into the calendar, then the
//            truck and driver are set with the same save as the Schedule (clashes refused) and
//            the driver and customer emails follow the usual day-before rule.
// Matt (limited) may book; quotes are for full users.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max).nullable().default(null);

const bodySchema = z.object({
  mode: z.enum(["quote", "book"]),
  channel: z.enum(["phone", "airtasker", "moval", "website_followup", "other"]),
  customerName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(50),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).default(""),
  need: z.enum(["moving", "junk"]),
  fromText: text(200),
  toText: text(200),
  movingDate: day.nullable().default(null),
  arrivalTime: time.nullable().default(null),
  truck: z.enum(truckIds).nullable().default(null),
  movers: z.number().int().min(1).max(10).nullable().default(null),
  hours: z.number().min(0.5).max(16).nullable().default(null),
  /** The team's own total (GST included); otherwise worked out from truck, movers and hours. */
  totalAud: z.number().min(0).max(200000).nullable().default(null),
  jobDescription: text(1000),
  platformJobNumber: text(100),
  truckId: z.string().uuid().nullable().default(null),
  driverId: z.string().uuid().nullable().default(null),
  notifyCustomer: z.boolean().default(true),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const admin = await guardAdmin(req, res);
  if (!admin) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Some of those details aren't valid.", issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return;
  }
  const b = parsed.data;
  if (b.mode === "quote" && admin.role !== "full") {
    res.status(403).json({ error: "Quotes are for full dashboard users. Book the job instead." });
    return;
  }
  const deps = buildQuoteDeps();
  if (!deps || !process.env.DATABASE_URL) {
    res.status(500).json({ error: "Email or database isn't configured yet." });
    return;
  }

  try {
    let lines: TeamFormJob["lines"] = null;
    if (b.mode === "book") {
      if (!b.movingDate || !b.arrivalTime || !b.truck || !b.movers || !b.hours || !b.truckId) {
        res.status(400).json({ error: "To book it, fill in the date, arrival time, truck, movers and hours." });
        return;
      }
      const priced = teamQuote({ truck: b.truck, movers: b.movers, hours: b.hours, stairFlights: 0, packingAud: 0, firstMoveApplied: false, overrideTotal: b.totalAud }, deps.rateCard);
      if (!priced.ok) {
        res.status(400).json({ error: priced.error });
        return;
      }
      lines = priced.lines;
    }

    const saved = await saveTeamFormJob(
      {
        externalRef: defaultReference(new Date()),
        linkedReference: null,
        customerName: b.customerName,
        phone: b.phone,
        email: b.email,
        need: b.need,
        jobDescription: b.jobDescription,
        fromText: b.fromText,
        toText: b.toText,
        movingDate: b.movingDate,
        arrivalTime: b.arrivalTime,
        truck: b.truck,
        movers: b.movers,
        lines,
        status: b.mode === "book" ? "booked" : "waiting_for_quote",
        channel: b.channel,
        platformJobNumber: b.platformJobNumber,
        finalAmountAud: null,
        firstBookingDiscount: null,
      },
      "dashboard",
    );
    if (!saved.ok) {
      res.status(400).json({ error: saved.error });
      return;
    }
    if (b.mode === "quote") {
      res.status(200).json({ ok: true, reference: saved.reference, notices: [] });
      return;
    }

    // The calendar slot saveTeamFormJob made: put the chosen truck and driver on it.
    const [slot] = await getDb()
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.quoteReference, saved.reference), eq(bookings.status, "confirmed")))
      .limit(1);
    if (!slot) {
      res.status(200).json({ ok: true, reference: saved.reference, notices: [], warning: "Saved, but it isn't in the calendar yet -- set the truck on the job page." });
      return;
    }
    const trip = await saveTrip(
      {
        id: slot.id,
        truckId: b.truckId!,
        date: b.movingDate!,
        start: b.arrivalTime!,
        end: fromMinutes(toMinutes(b.arrivalTime!) + Math.round(b.hours! * 60)),
        movers: b.movers!,
        driverId: b.driverId,
        customerNoticeWanted: b.notifyCustomer && b.email !== "",
        customerName: b.customerName,
        phone: b.phone,
        customerEmail: b.email || null,
        fromText: b.fromText,
        toText: b.toText,
        notes: b.platformJobNumber ? `Platform job ${b.platformJobNumber}` : null,
      },
      admin.userId,
    );
    if (!trip.ok) {
      res.status(200).json({ ok: true, reference: saved.reference, notices: [], warning: `Saved, but the truck wasn't set: ${describeProblem(trip.problem, trip.truckName)}` });
      return;
    }
    const notices = [driverNoticeLine(await deps.notifyDriver?.({ bookingId: trip.id })), customerNoticeLine(await deps.notifyCustomer?.({ bookingId: trip.id }))].filter(Boolean);
    res.status(200).json({ ok: true, reference: saved.reference, notices });
  } catch (err) {
    console.error("New job failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't save that job just now. Please try again." });
  }
}
