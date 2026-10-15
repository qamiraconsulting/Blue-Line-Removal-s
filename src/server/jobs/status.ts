// One status for every customer request, whatever channel it came in on (website form, chat,
// Matt's Google Form, a platform booking). Stored in quotes.job_status and changed only by the
// steps below -- so the dashboard's Overview can count requests without guessing.
//
//   waiting_for_quote  -> the form/chat couldn't price it; nobody has quoted yet
//   estimate_sent      -> instant estimate given (form or chat)
//   quoted             -> the team (dashboard or Matt's Google Form) sent a quote
//   booking_requested  -> the customer agreed to the booking terms; the team confirms
//   booked             -> confirmed and in the calendar
//   completed          -> the move is done; final amount recorded
//   cancelled / rejected / lost -> closed, with a reason
//
// "Lost" is also worked out on the fly: an estimate or quote past its valid-until date (or its
// moving date) that was never booked counts as lost without anyone having to mark it.

export const jobStatuses = [
  "waiting_for_quote",
  "estimate_sent",
  "quoted",
  "booking_requested",
  "booked",
  "completed",
  "cancelled",
  "rejected",
  "lost",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  waiting_for_quote: "Waiting for quote",
  estimate_sent: "Estimate sent",
  quoted: "Quoted by team",
  booking_requested: "Booking requested",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  lost: "Lost / expired",
};

export const OPEN_STATUSES: readonly JobStatus[] = ["waiting_for_quote", "estimate_sent", "quoted", "booking_requested", "booked"];

/** Where a request came from, for the dashboard. */
export const CHANNEL_LABEL: Record<string, string> = {
  quote_form: "Website form",
  chatbot: "Chat",
  phone: "Phone",
  airtasker: "Airtasker",
  moval: "Moval",
  website_followup: "Website follow-up",
  other: "Other",
};

export function channelOf(row: { source: string; channel: string | null }): string {
  if (row.source === "team_form") return row.channel ?? "other";
  return row.source;
}

/**
 * The status to show: the stored one, except that an unbooked estimate/quote whose valid-until
 * (or moving) date has passed shows as lost, and a booked job whose moving date has passed is
 * flagged so the team marks it complete.
 */
export function effectiveStatus(
  row: { jobStatus: string; validUntil: string | null; movingDate: string | null },
  today: string,
): { status: JobStatus; toComplete: boolean } {
  const stored = (jobStatuses as readonly string[]).includes(row.jobStatus) ? (row.jobStatus as JobStatus) : "waiting_for_quote";
  if (stored === "estimate_sent" || stored === "quoted") {
    const expired = (row.validUntil !== null && row.validUntil < today) || (row.movingDate !== null && row.movingDate < today);
    if (expired) return { status: "lost", toComplete: false };
  }
  if (stored === "booked" && row.movingDate !== null && row.movingDate < today) return { status: "booked", toComplete: true };
  return { status: stored, toComplete: false };
}

/** Which team actions are allowed from each status. */
export const TEAM_ACTIONS: Record<JobStatus, readonly ("sendQuote" | "confirm" | "reject" | "cancel" | "complete" | "markLost" | "reopen")[]> = {
  waiting_for_quote: ["sendQuote", "confirm", "reject", "markLost"],
  estimate_sent: ["sendQuote", "confirm", "reject", "markLost"],
  quoted: ["sendQuote", "confirm", "reject", "markLost"],
  booking_requested: ["confirm", "sendQuote", "reject"],
  booked: ["complete", "cancel"],
  completed: [],
  cancelled: ["reopen"],
  rejected: ["reopen"],
  lost: ["reopen", "sendQuote"],
};
