import { channelOf, effectiveStatus, type JobStatus } from "./status.js";

// The dashboard's Overview tab: a first-level, at-a-glance view of every request from every
// channel (Ayesha, 2026-10-15) -- not a detailed report. Pure: rows in, numbers out.

export interface OverviewRow {
  reference: string;
  createdAt: Date | string;
  source: string;
  channel: string | null;
  jobStatus: string;
  validUntil: string | null;
  movingDate: string | null;
  amountAud: number | null;
  quotedAmountAud: number | null;
  finalAmountAud: number | null;
  completedAt: Date | string | null;
  statusUpdatedAt: Date | string;
}

export interface OverviewSummary {
  period: { from: string; to: string };
  /** Right now, whatever the period. */
  now: {
    waitingForQuote: number;
    /** Oldest request still waiting for a quote -- vs the "2hr response" promise. */
    oldestWaitingSince: string | null;
    bookingRequested: number;
    estimatesNotBooked: number;
    bookedNext7Days: { jobs: number; valueAud: number };
    toMarkComplete: number;
  };
  /** Requests that came in during the period, by channel and (current) status. */
  byChannel: Record<string, Partial<Record<JobStatus, number>> & { total: number }>;
  inPeriod: {
    requests: number;
    booked: number; // booked or completed
    conversionPercent: number | null;
    completed: { jobs: number; revenueAud: number };
    lost: number;
    rejected: number;
    cancelled: number;
  };
}

const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());
const melbourneDate = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date(iso(d)));

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The price a job is worth: what was charged, else what was quoted, else the estimate. */
export const jobValue = (r: Pick<OverviewRow, "finalAmountAud" | "quotedAmountAud" | "amountAud">) => r.finalAmountAud ?? r.quotedAmountAud ?? r.amountAud ?? 0;

export function summarise(rows: OverviewRow[], today: string, from: string, to: string): OverviewSummary {
  const withStatus = rows.map((r) => ({ ...r, ...effectiveStatus(r, today), channelKey: channelOf(r), created: melbourneDate(r.createdAt) }));

  const waiting = withStatus.filter((r) => r.status === "waiting_for_quote");
  const oldest = waiting.map((r) => iso(r.createdAt)).sort()[0] ?? null;
  const weekEnd = addDays(today, 7);
  const upcoming = withStatus.filter((r) => r.status === "booked" && !r.toComplete && r.movingDate !== null && r.movingDate >= today && r.movingDate <= weekEnd);

  const inPeriod = withStatus.filter((r) => r.created >= from && r.created <= to);
  const byChannel: OverviewSummary["byChannel"] = {};
  for (const r of inPeriod) {
    const c = (byChannel[r.channelKey] ??= { total: 0 });
    c.total += 1;
    c[r.status] = (c[r.status] ?? 0) + 1;
  }

  const count = (s: JobStatus) => inPeriod.filter((r) => r.status === s).length;
  const booked = inPeriod.filter((r) => r.status === "booked" || r.status === "completed").length;
  // Completed in the period counts by completion date, not by when the request came in.
  const completed = withStatus.filter((r) => r.status === "completed" && r.completedAt && melbourneDate(r.completedAt) >= from && melbourneDate(r.completedAt) <= to);

  return {
    period: { from, to },
    now: {
      waitingForQuote: waiting.length,
      oldestWaitingSince: oldest,
      bookingRequested: withStatus.filter((r) => r.status === "booking_requested").length,
      estimatesNotBooked: withStatus.filter((r) => r.status === "estimate_sent" || r.status === "quoted").length,
      bookedNext7Days: { jobs: upcoming.length, valueAud: upcoming.reduce((sum, r) => sum + jobValue(r), 0) },
      toMarkComplete: withStatus.filter((r) => r.toComplete).length,
    },
    byChannel,
    inPeriod: {
      requests: inPeriod.length,
      booked,
      conversionPercent: inPeriod.length ? Math.round((booked / inPeriod.length) * 100) : null,
      completed: { jobs: completed.length, revenueAud: completed.reduce((sum, r) => sum + jobValue(r), 0) },
      lost: count("lost"),
      rejected: count("rejected"),
      cancelled: count("cancelled"),
    },
  };
}

