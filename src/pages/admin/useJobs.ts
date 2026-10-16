import { useCallback, useEffect, useState } from "react";
import type { JobStatus } from "../../server/jobs/status";
import { useAdminApi } from "./useAdminApi";

// The dashboard's view of every request (GET /api/admin/jobs) -- shared by Overview and Lead review.

export interface QuoteLines {
  truck: string | null;
  movers: number | null;
  hours: number | null;
  rateHr: number | null;
  stairFlights: number;
  labour: number;
  callOut: number;
  packing: number;
  stair: number;
  adjustment: number;
  subtotal: number;
  gst: number;
  total: number;
  services: string;
}

export type JobAction = "sendQuote" | "confirm" | "reject" | "cancel" | "complete" | "markLost" | "reopen";

export interface Job {
  reference: string;
  createdAt: string;
  channel: string;
  source: string;
  conversationId: string | null;
  status: JobStatus;
  toComplete: boolean;
  actions: JobAction[];
  manualReason: string | null;
  customerName: string;
  phone: string;
  email: string;
  need: string;
  propertySize: string | null;
  accessNotes: string | null;
  jobDescription: string | null;
  customerNotes: string | null;
  bookingNotes: string | null;
  movingDate: string | null;
  arrivalTime: string | null;
  fromText: string | null;
  toText: string | null;
  firstMoveApplied: boolean;
  estimateAud: number | null;
  quotedAmountAud: number | null;
  finalAmountAud: number | null;
  validUntil: string | null;
  lines: QuoteLines | null;
  changeNote: string | null;
  quoteSentAt: string | null;
  externalRef: string | null;
  platformJobNumber: string | null;
  calendarIssue: string | null;
  closedReason: string | null;
  statusUpdatedAt: string;
  testMode: boolean;
  depositRequired: boolean;
  depositStatus: "awaiting_payment" | "processing" | "paid" | "failed" | "expired" | null;
  depositPaidAt: string | null;
  depositPaymentMethod: string | null;
  depositTestMode: boolean | null;
}

export interface Summary {
  period: { from: string; to: string };
  now: {
    waitingForQuote: number;
    oldestWaitingSince: string | null;
    bookingRequested: number;
    estimatesNotBooked: number;
    bookedNext7Days: { jobs: number; valueAud: number };
    toMarkComplete: number;
  };
  byChannel: Record<string, Partial<Record<JobStatus, number>> & { total: number }>;
  inPeriod: {
    requests: number;
    booked: number;
    conversionPercent: number | null;
    completed: { jobs: number; revenueAud: number };
    lost: number;
    rejected: number;
    cancelled: number;
  };
}

export interface JobsData {
  today: string;
  summary: Summary;
  jobs: Job[];
  pdfQuotes: boolean;
  testInbox: boolean;
}

export function useJobs(period?: { from: string; to: string }) {
  const { adminFetch } = useAdminApi();
  const [data, setData] = useState<JobsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = period ? `?from=${period.from}&to=${period.to}` : "";

  const reload = useCallback(() => {
    adminFetch(`/api/admin/jobs${query}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load");
        return body as JobsData;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(reload, [reload]);
  return { data, error, reload };
}

export const aud = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`);
