import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../src/server/db/client.js";
import { quotes } from "../../src/server/db/schema.js";
import {
  applyEdits,
  cancelAction,
  completeAction,
  confirmAction,
  currentLines,
  dbJobStore,
  markLostAction,
  rejectAction,
  reopenAction,
  sendQuoteAction,
  teamEditsSchema,
  type JobDeps,
} from "../../src/server/jobs/actions.js";
import { summarise } from "../../src/server/jobs/overview.js";
import { channelOf, effectiveStatus, OPEN_STATUSES, TEAM_ACTIONS } from "../../src/server/jobs/status.js";
import { buildQuoteDeps } from "../../src/server/quote/deps.js";
import { depositFor } from "../../src/server/quote/deposit.js";
import { melbourneToday } from "../../src/server/quote/service.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Dashboard: every customer request from every channel, with its one status.
//   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD -> Overview numbers + the jobs (open ones, and any from the period)
//   POST { action, reference, ... }      -> sendQuote | confirm | reject | cancel | complete | markLost | reopen,
//                                           or preview (the recalculated lines for some edits; saves nothing)
// sendQuote and confirm may carry edits (details and/or the team's own total, with a note to
// the customer) and send the branded PDF quote.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ref = z.string().trim().min(4).max(40);
const by = z.object({ reference: ref });

const actionSchema = z.discriminatedUnion("action", [
  by.extend({ action: z.literal("preview"), edits: teamEditsSchema.default({}) }),
  by.extend({ action: z.literal("sendQuote"), edits: teamEditsSchema.default({}), notifyCustomer: z.boolean().default(true) }),
  by.extend({ action: z.literal("confirm"), edits: teamEditsSchema.default({}), truckId: z.string().uuid().nullable().optional(), notifyCustomer: z.boolean().default(true) }),
  by.extend({ action: z.literal("reject"), reason: z.string().trim().min(2).max(300), messageToCustomer: z.string().trim().max(1000).optional() }),
  by.extend({ action: z.literal("cancel"), reason: z.string().trim().min(2).max(300) }),
  by.extend({ action: z.literal("complete"), finalAmountAud: z.number().int().min(0).max(200000) }),
  by.extend({ action: z.literal("markLost"), reason: z.string().trim().min(2).max(300) }),
  by.extend({ action: z.literal("reopen") }),
]);

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await guardAdmin(req, res);
  if (!admin) return;

  const deps = buildQuoteDeps();
  if (!deps || !process.env.DATABASE_URL) {
    res.status(500).json({ error: "Email or database isn't configured yet." });
    return;
  }

  try {
    if (req.method === "GET") {
      const today = melbourneToday(new Date());
      const from = typeof req.query.from === "string" && day.safeParse(req.query.from).success ? req.query.from : addDays(today, -29);
      const to = typeof req.query.to === "string" && day.safeParse(req.query.to).success ? req.query.to : today;

      // A small business: the latest couple of thousand requests cover every open job.
      const rows = await getDb().select().from(quotes).orderBy(desc(quotes.createdAt)).limit(2000);
      const summary = summarise(rows, today, from, to);

      const melbourne = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(d);
      const jobs = rows
        .map((r) => ({ r, ...effectiveStatus(r, today) }))
        .filter(({ r, status }) => (OPEN_STATUSES as readonly string[]).includes(status) || (melbourne(r.createdAt) >= from && melbourne(r.createdAt) <= to))
        .map(({ r, status, toComplete }) => ({
          reference: r.reference,
          createdAt: r.createdAt,
          channel: channelOf(r),
          source: r.source,
          conversationId: r.conversationId,
          storedStatus: r.jobStatus,
          status,
          toComplete,
          actions: TEAM_ACTIONS[status],
          manualReason: r.manualReason,
          customerName: r.customerName,
          phone: r.phone,
          email: r.email,
          need: r.need,
          propertySize: r.propertySize,
          accessNotes: r.accessNotes,
          jobDescription: r.jobDescription,
          customerNotes: r.customerNotes,
          bookingNotes: r.bookingNotes,
          movingDate: r.movingDate,
          arrivalTime: r.bookingArrivalTime,
          fromText: r.fromText,
          toText: r.toText,
          firstMoveApplied: r.firstMoveApplied,
          estimateAud: r.amountAud,
          quotedAmountAud: r.quotedAmountAud,
          finalAmountAud: r.finalAmountAud,
          validUntil: r.validUntil,
          lines: currentLines(r, deps.rateCard),
          changeNote: r.changeNote,
          quoteSentAt: r.quoteSentAt,
          externalRef: r.externalRef,
          platformJobNumber: r.platformJobNumber,
          calendarIssue: r.calendarIssue,
          closedReason: r.closedReason,
          statusUpdatedAt: r.statusUpdatedAt,
          testMode: r.source !== "team_form" && r.rateCardStatus !== "confirmed",
          // Website/chat bookings made a week or more ahead take the $100 deposit (Matt handles his own).
          depositRequired:
            r.source !== "team_form" &&
            (status === "booking_requested" || status === "booked") &&
            depositFor(r.movingDate, melbourne(r.bookingRequestedAt ?? r.createdAt), null).required,
        }));

      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ today, summary, jobs, pdfQuotes: Boolean(deps.pdf), testInbox: Boolean(deps.testEmailTo) });
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
    const jobDeps: JobDeps = { ...deps, jobs: dbJobStore };
    const who = admin.userId;

    // The editor's live breakdown: worked out here so the rates never reach the browser bundle.
    if (body.action === "preview") {
      const q = await dbJobStore.find(body.reference);
      if (!q) {
        res.status(404).json({ error: "That job wasn't found." });
        return;
      }
      const applied = applyEdits(q, body.edits, deps.rateCard);
      res.status(applied.ok ? 200 : 400).json(applied.ok ? { ok: true, lines: applied.lines } : { error: applied.error });
      return;
    }

    const result =
      body.action === "sendQuote"
        ? await sendQuoteAction({ reference: body.reference, edits: body.edits, notifyCustomer: body.notifyCustomer, by: who }, jobDeps)
        : body.action === "confirm"
          ? await confirmAction({ reference: body.reference, edits: body.edits, truckId: body.truckId, notifyCustomer: body.notifyCustomer, by: who }, jobDeps)
          : body.action === "reject"
            ? await rejectAction({ reference: body.reference, reason: body.reason, messageToCustomer: body.messageToCustomer, by: who }, jobDeps)
            : body.action === "cancel"
              ? await cancelAction({ reference: body.reference, reason: body.reason, by: who }, jobDeps)
              : body.action === "complete"
                ? await completeAction({ reference: body.reference, finalAmountAud: body.finalAmountAud, by: who }, jobDeps)
                : body.action === "markLost"
                  ? await markLostAction({ reference: body.reference, reason: body.reason, by: who }, jobDeps)
                  : await reopenAction({ reference: body.reference, by: who }, jobDeps);

    if (!result.ok) {
      res.status(result.code === "not_found" ? 404 : result.code === "not_allowed" ? 409 : 400).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error("Admin jobs failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't do that just now. Please try again." });
  }
}
