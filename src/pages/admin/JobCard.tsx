import { useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { CHANNEL_LABEL, JOB_STATUS_LABEL } from "../../server/jobs/status";
import { JobEditor } from "./JobEditor";
import { useAdminApi } from "./useAdminApi";
import { aud, type Job } from "./useJobs";

// One request, from any channel, with the actions its status allows.

// Why a quote didn't get an instant price, in words for Blue Line staff.
export const REASONS: Record<string, string> = {
  junk_removal: "Junk removal",
  size_missing: "No home size given",
  commercial_or_unsure_size: "Office move or unsure home size",
  special_items: "Specialist items (piano, safe...)",
  date_missing: "No valid moving date",
  distance_unavailable: "Couldn't work out the distance",
  outside_service_area: "Outside the service area",
  rate_card_not_confirmed: "Price list not signed off yet",
  rate_card_incomplete: "Price list incomplete for this job",
  service_unavailable: "Quote system unavailable",
  small_load: "A few boxes / single items",
  specialist_item: "Specialist item (piano, safe...)",
  office_move: "Office move",
  storage: "Storage unit move",
  warehouse: "Warehouse / commercial goods",
  outside_melbourne: "Outside metro Melbourne",
  urgent_or_timed: "Today or a fixed deadline",
  packing: "Packing",
  other: "Needs a personal quote",
};

export const STATUS_STYLE: Record<string, string> = {
  waiting_for_quote: "bg-orange-100 text-orange-800",
  booking_requested: "bg-orange-100 text-orange-800",
  estimate_sent: "bg-sky-100 text-sky-800",
  quoted: "bg-violet-100 text-violet-800",
  booked: "bg-green-100 text-green-800",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  lost: "bg-red-50 text-red-600",
};

type Open = null | "confirm" | "sendQuote" | "reject" | "cancel" | "complete" | "markLost";

const ACTION_LABEL: Record<string, string> = {
  confirm: "Review & confirm",
  sendQuote: "Edit & send quote",
  complete: "Mark complete",
  cancel: "Cancel booking",
  reject: "Reject",
  markLost: "Mark lost",
  reopen: "Reopen",
};

export function JobCard({ job, onChanged }: { job: Job; onChanged: (message: string) => void }) {
  const price = job.finalAmountAud ?? job.quotedAmountAud ?? job.estimateAud;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display font-bold text-navy">
          {job.customerName}
          {job.movingDate && <span className="font-normal text-slate-600"> &middot; {job.movingDate}{job.arrivalTime && ` ${job.arrivalTime}`}</span>}
        </p>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span className={clsx("rounded-full px-2 py-0.5 font-bold", STATUS_STYLE[job.status])}>
            {JOB_STATUS_LABEL[job.status]}
            {job.toComplete && " -- date passed"}
          </span>
          {CHANNEL_LABEL[job.channel] ?? job.channel} &middot; {job.reference}
          {job.externalRef && job.externalRef !== job.reference && ` / ${job.externalRef}`}
          {job.testMode && " · TEST"}
        </p>
      </div>
      <p className="text-sm text-slate-600">
        {job.phone} &middot; {job.email}
      </p>
      <p className="text-sm text-slate-600">
        {job.need === "junk" ? "Junk removal" : `${job.fromText ?? "?"} → ${job.toText ?? "?"}`}
        {job.lines?.truck && ` · ${job.lines.truck}${job.lines.movers ? `, ${job.lines.movers} movers` : ""}${job.lines.hours ? `, ${job.lines.hours} h` : ""}`}
        {price !== null && (
          <>
            {" "}&middot; <strong className="text-navy">{aud(price)}</strong>
            {job.finalAmountAud !== null ? " charged" : job.quotedAmountAud !== null && job.quotedAmountAud !== job.estimateAud ? ` quoted (estimate ${aud(job.estimateAud)})` : job.quotedAmountAud !== null ? " quoted" : " estimate"}
          </>
        )}
      </p>
      {job.status === "waiting_for_quote" && job.manualReason && <p className="mt-1 text-sm font-bold text-action">{REASONS[job.manualReason] ?? job.manualReason}</p>}
      {job.jobDescription && <p className="mt-1 text-sm text-slate-600">Job: {job.jobDescription}</p>}
      {job.accessNotes && <p className="mt-1 text-sm text-slate-600">Access: {job.accessNotes}</p>}
      {job.customerNotes && <p className="mt-1 text-sm text-slate-600">Customer notes: {job.customerNotes}</p>}
      {job.bookingNotes && <p className="mt-1 text-sm text-slate-600">Booking notes: {job.bookingNotes}</p>}
      {job.changeNote && <p className="mt-1 text-sm text-slate-600">Note sent to customer: {job.changeNote}</p>}
      {job.platformJobNumber && <p className="mt-1 text-sm text-slate-600">Platform job: {job.platformJobNumber}</p>}
      {job.calendarIssue && <p className="mt-1 text-sm font-bold text-red-600">{job.calendarIssue}</p>}
      {(job.depositRequired || job.depositStatus) && <DepositLine job={job} />}
      {job.closedReason && <p className="mt-1 text-sm text-slate-500">Reason: {job.closedReason}</p>}

      <JobActions job={job} onChanged={onChanged} chatLink />
    </li>
  );
}

/** The buttons a job's status allows, with their forms. Used by the job card and the new dashboard's job page. */
export function JobActions({ job, onChanged, chatLink }: { job: Job; onChanged: (message: string) => void; chatLink?: boolean }) {
  const { adminFetch } = useAdminApi();
  const [open, setOpen] = useState<Open>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [finalAmount, setFinalAmount] = useState(String(job.quotedAmountAud ?? job.estimateAud ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(action: string, extra: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ action, reference: job.reference, ...extra }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "That didn't work");
      setOpen(null);
      onChanged(done + (out.emailed ? " The customer was emailed." : "") + (out.driverMessage ? ` ${out.driverMessage}` : ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  // "Confirm" from a quote/estimate = the customer accepted by phone; from a request = their online booking.
  const actionLabel = (a: string) => (a === "confirm" && job.status !== "booking_requested" ? "Book it (customer accepted)" : (ACTION_LABEL[a] ?? a));

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job.actions.map((a) =>
          a === "reopen" ? (
            <button key={a} type="button" disabled={busy} onClick={() => void post("reopen", {}, `${job.reference} reopened.`)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700">
              Reopen
            </button>
          ) : (
            <button
              key={a}
              type="button"
              onClick={() => setOpen(open === a ? null : (a as Open))}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-bold",
                a === "confirm" || a === "sendQuote" || a === "complete" ? "bg-navy text-white" : "border border-slate-300 text-slate-700",
                open === a && "ring-2 ring-action",
              )}
            >
              {actionLabel(a)}
            </button>
          ),
        )}
        {chatLink && job.conversationId && (
          <Link to={`/admin/classic/conversations/${job.conversationId}`} className="text-sm text-navy underline">
            Open the chat
          </Link>
        )}
      </div>

      {(open === "confirm" || open === "sendQuote") && (
        <JobEditor
          job={job}
          mode={open}
          onCancel={() => setOpen(null)}
          onDone={(m) => {
            setOpen(null);
            onChanged(m);
          }}
        />
      )}

      {(open === "reject" || open === "cancel" || open === "markLost") && (
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Reason (for the team)
            <input className="rounded border border-slate-300 px-2 py-1.5 text-sm font-normal" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={open === "reject" ? "e.g. outside our area" : open === "cancel" ? "e.g. customer changed plans" : "e.g. went with another company"} />
          </label>
          {open === "reject" && (
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Message to the customer (optional -- leave blank to send nothing)
              <textarea rows={2} className="rounded border border-slate-300 px-2 py-1.5 text-sm font-normal" value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy || reason.trim().length < 2}
              onClick={() => void post(open, { reason, ...(open === "reject" && message.trim() ? { messageToCustomer: message } : {}) }, `${job.reference}: ${ACTION_LABEL[open]?.toLowerCase()} done.`)}
              className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
            >
              {ACTION_LABEL[open]}
            </button>
            <button type="button" onClick={() => setOpen(null)} className="text-sm text-slate-600 underline">
              Close
            </button>
          </div>
        </div>
      )}

      {open === "complete" && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Final amount charged on the day ($, GST incl.)
            <input type="number" min={0} className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm font-normal" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || finalAmount === ""}
            onClick={() => void post("complete", { finalAmountAud: Math.round(Number(finalAmount)) }, `${job.reference} marked complete.`)}
            className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            Mark complete
          </button>
          <button type="button" onClick={() => setOpen(null)} className="text-sm text-slate-600 underline">
            Close
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}

/** The $100 deposit, as Stripe last reported it. */
export function DepositLine({ job }: { job: Job }) {
  const paidOn = job.depositPaidAt ? new Date(job.depositPaidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" }) : "";
  const test = job.depositTestMode ? " (Stripe test)" : "";
  const [text, tone] =
    job.depositStatus === "paid"
      ? [`Deposit $100 PAID${job.depositPaymentMethod ? ` by ${job.depositPaymentMethod}` : ""}${paidOn ? ` on ${paidOn}` : ""}${test}.${job.status === "booking_requested" ? " Not confirmed automatically -- please confirm a time with the customer, or refund it in Stripe." : ""}`, "text-emerald-700"]
      : job.depositStatus === "processing"
        ? ["Deposit $100: bank payment (PayTo) approved, waiting for Stripe to confirm it (usually within a minute).", "text-action"]
        : job.depositStatus === "awaiting_payment"
          ? ["Deposit $100: payment link sent, not paid yet. It confirms the booking automatically when paid.", "text-action"]
          : job.depositStatus === "expired"
            ? ["Deposit $100 NOT paid: the 24-hour payment link expired. Follow up with the customer.", "text-red-600"]
            : job.depositStatus === "failed"
              ? ["Deposit $100 NOT paid: the bank payment failed. Follow up with the customer.", "text-red-600"]
              : ["Deposit $100 required (move a week or more ahead) -- no payment link was made (Stripe not set up). Send the customer one.", "text-action"];
  return <p className={`mt-1 text-sm font-bold ${tone}`}>{text}</p>;
}
