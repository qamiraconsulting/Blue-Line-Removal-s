import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import clsx from "clsx";
import { shortDay } from "../../lib/noticeTiming";
import { fromMinutes, time12, toMinutes, tripEnd } from "../../lib/truckTrips";
import { CHANNEL_LABEL, JOB_STATUS_LABEL } from "../../server/jobs/status";
import { ChatThread } from "../admin/ConversationDetail";
import { useCapacity, type Booking } from "../admin/capacityShared";
import { DepositLine, JobActions, REASONS } from "../admin/JobCard";
import { useAdminRole } from "../admin/useAdminRole";
import { aud, useJobs, type Job } from "../admin/useJobs";
import { allowedActions, ChannelChip, jobPrice, Notice, Panel, route, StatusPill } from "./shared";

// One page per job: what to do next, the move, the price and deposit, the truck and driver,
// the chat and what has happened so far. Replaces the job cards that were repeated on three
// tabs, the separate chat page and editing the trip on Booking and trucks.

const STEPS = ["Request in", "Priced", "Customer agreed", "Booked", "Done"];
const STEP: Partial<Record<Job["status"], number>> = { waiting_for_quote: 1, estimate_sent: 2, quoted: 2, booking_requested: 3, booked: 4, completed: 5 };

function nextStep(j: Job): [string, string] | null {
  switch (j.status) {
    case "waiting_for_quote":
      return ["Send a quote", `${(j.manualReason && REASONS[j.manualReason]) ?? "This request"} needed a personal price. Send the quote; the customer gets the PDF by email.`];
    case "estimate_sent":
    case "quoted":
      return ["Follow up", `The customer has a price${j.validUntil ? ` until ${shortDay(j.validUntil)}` : ""} but hasn't booked. If they accept by phone, book it here.`];
    case "booking_requested":
      return ["Confirm the booking", "The customer agreed to the booking terms. Check the details, then confirm: it goes in the schedule and the customer gets the confirmed PDF quote."];
    case "booked":
      return j.toComplete ? ["Mark it complete", "The moving date has passed. Record what was charged on the day."] : ["Booked", "Driver and customer emails go out at 9:00 am the day before the move."];
    default:
      return null;
  }
}

export default function JobPage() {
  const { ref } = useParams<{ ref: string }>();
  const role = useAdminRole();
  const one = useMemo(() => ({ reference: ref ?? "" }), [ref]);
  const jobs = useJobs(one);
  const cap = useCapacity();
  // A message from the New job form, shown once on arrival.
  const arrived = (useLocation().state as { notice?: string } | null)?.notice ?? null;
  const [notice, setNotice] = useState<string | null>(arrived);
  const job = jobs.data?.jobs.find((j) => j.reference === ref);

  // The booking for this job sits on its moving date in the same calendar the chat reads.
  const date = job?.movingDate;
  useEffect(() => {
    if (date) cap.changeRange({ from: date, to: date, tripDay: date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const booking = cap.data?.bookings.find((b) => b.quoteReference === ref && b.status === "confirmed") ?? null;

  const changed = (m: string) => {
    setNotice(m);
    jobs.reload();
    void cap.load();
  };

  if (jobs.error) return <Notice text={jobs.error} error />;
  if (!jobs.data) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!job)
    return (
      <div className="grid gap-3">
        <BackLink />
        <p className="text-sm text-slate-600">No job {ref}.</p>
      </div>
    );

  const step = STEP[job.status];
  const next = nextStep(job);
  const actions = allowedActions(job, role);
  const price = jobPrice(job);

  return (
    <div className="grid gap-5">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-black text-navy">{job.customerName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            <StatusPill status={job.status} />
            <ChannelChip channel={job.channel} />
            <span className="tabular-nums">{job.reference}</span>
            {job.externalRef && job.externalRef !== job.reference && <span>/ {job.externalRef}</span>}
            <span>· in {shortDay(new Date(job.createdAt).toISOString().slice(0, 10))}</span>
            {job.testMode && <b>TEST</b>}
          </div>
        </div>
        <p className="text-sm text-slate-600">
          {job.phone}
          {job.email && ` · ${job.email}`}
        </p>
      </div>

      {step ? (
        <div className="grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className={clsx("grid gap-1.5 text-[11px] font-semibold sm:text-xs", i < step ? "text-slate-600" : i === step ? "text-navy" : "text-slate-400")}>
              <i className={clsx("block h-[5px] rounded", i < step ? "bg-eco" : i === step ? "bg-action" : "bg-slate-200")} />
              {s}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {JOB_STATUS_LABEL[job.status]}
          {job.closedReason && `: ${job.closedReason}`}
        </p>
      )}
      <Notice text={notice} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          {(next || actions.length > 0) && (
            <Panel title={next ? `Next: ${next[0]}` : "Actions"} className="border-action bg-orange-50/60">
              <div className="px-4 pb-4">
                {next && <p className="text-sm">{next[1]}</p>}
                {actions.length > 0 ? <JobActions job={{ ...job, actions }} onChanged={changed} /> : <p className="mt-2 text-xs text-slate-500">Quotes and confirming are for full dashboard users.</p>}
              </div>
            </Panel>
          )}

          <Panel title="The move">
            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 pb-4 text-sm">
              <Kv k="What">{job.need === "junk" ? "Junk removal" : "Move"}{job.propertySize && ` · ${job.propertySize}`}</Kv>
              <Kv k="Route">{route(job)}</Kv>
              <Kv k="Moving date">{job.movingDate ? `${shortDay(job.movingDate)}${job.arrivalTime ? `, arrive ${time12(job.arrivalTime)}` : ""}` : "Not given"}</Kv>
              {job.lines?.truck && <Kv k="Crew">{job.lines.truck}{job.lines.movers ? `, ${job.lines.movers} movers` : ""}{job.lines.hours ? `, about ${job.lines.hours} h` : ""}</Kv>}
              {job.accessNotes && <Kv k="Access">{job.accessNotes}</Kv>}
              {job.jobDescription && <Kv k="Job">{job.jobDescription}</Kv>}
              {job.customerNotes && <Kv k="Customer notes">{job.customerNotes}</Kv>}
              {job.bookingNotes && <Kv k="Booking notes">{job.bookingNotes}</Kv>}
              {job.changeNote && <Kv k="Note sent">{job.changeNote}</Kv>}
              {job.platformJobNumber && <Kv k="Platform job">{job.platformJobNumber}</Kv>}
              {job.calendarIssue && <Kv k="Calendar"><b className="text-red-600">{job.calendarIssue}</b></Kv>}
            </dl>
          </Panel>

          {job.conversationId && (
            <Panel title="Chat">
              <div className="px-4 pb-4">
                <ChatThread id={job.conversationId} inJob />
              </div>
            </Panel>
          )}
        </div>

        <div className="grid min-w-0 gap-5">
          <Panel title="Price" aside={job.firstMoveApplied ? <span className="rounded border border-slate-200 px-1.5 text-[11px] font-semibold text-slate-500">10% first booking</span> : undefined}>
            <div className="grid gap-1.5 px-4 pb-4 text-sm">
              {price === null && <p className="text-slate-500">No price yet.</p>}
              {job.estimateAud !== null && <Line k="Instant estimate" v={aud(job.estimateAud)} />}
              {job.quotedAmountAud !== null && <Line k="Team quote" v={aud(job.quotedAmountAud)} />}
              {job.finalAmountAud !== null && <Line k="Charged on the day" v={aud(job.finalAmountAud)} />}
              {job.lines && job.lines.gst > 0 && <Line k="Includes GST" v={aud(job.lines.gst)} dim />}
              {price !== null && (
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-display text-[15px] font-extrabold text-navy">
                  <span>{job.finalAmountAud !== null ? "Final" : "Total"}</span>
                  <span className="tabular-nums">{aud(price)}</span>
                </div>
              )}
              {job.validUntil && (job.status === "estimate_sent" || job.status === "quoted") && <p className="text-xs text-slate-500">Valid until {shortDay(job.validUntil)}</p>}
              {(job.depositRequired || job.depositStatus) && <DepositLine job={job} />}
            </div>
          </Panel>

          {(booking || job.status === "booked") && <TruckDriver booking={booking} cap={cap} />}

          <Panel title="Activity">
            <ol className="px-4 pb-4 text-[12.5px]">
              {activity(job, booking).map(([at, text], i) => (
                <li key={i} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2.5 border-t border-slate-100 py-1.5 first:border-t-0">
                  <time className="tabular-nums text-slate-400">{at}</time>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/new/requests" className="text-sm font-semibold text-slate-500 hover:text-navy">
      &larr; Requests
    </Link>
  );
}

function Kv({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-slate-400">{k}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function Line({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className={clsx("flex justify-between gap-3", dim && "text-slate-500")}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

const stamp = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** What has happened, from the dates already stored on the job and its booking (no separate log). */
function activity(j: Job, b: Booking | null): [string, string][] {
  const out: [string, string][] = [];
  const at = (iso: string | null | undefined, text: string) => iso && out.push([iso, text]);
  at(j.createdAt, `Request in from ${CHANNEL_LABEL[j.channel] ?? j.channel}${j.estimateAud !== null ? `, estimate ${aud(j.estimateAud)}` : ""}`);
  at(j.quoteSentAt, `Quote emailed${j.quotedAmountAud !== null ? `: ${aud(j.quotedAmountAud)}` : ""}`);
  at(j.depositPaidAt, "$100 deposit paid");
  at(b?.driverNotifiedAt, `Driver emailed${b?.driverName ? ` (${b.driverName})` : ""}`);
  at(b?.customerNotifiedAt, "Customer emailed their booking details");
  if (Math.abs(new Date(j.statusUpdatedAt).getTime() - new Date(j.createdAt).getTime()) > 60_000) at(j.statusUpdatedAt, `Status: ${JOB_STATUS_LABEL[j.status]}`);
  out.sort((x, y) => y[0].localeCompare(x[0]));
  const rows: [string, string][] = out.map(([iso, text]) => [stamp(iso), text]);
  if (b && !b.driverNotifiedAt) rows.unshift(["Due", `Driver and customer emails at 9:00 am ${shortDay(b.noticeDueOn)}`]);
  return rows;
}

/** The booking's truck, driver and time -- the same save as Booking and trucks (the server refuses clashes). */
function TruckDriver({ booking, cap }: { booking: Booking | null; cap: ReturnType<typeof useCapacity> }) {
  const [f, setF] = useState({ truckId: "", driverId: "", date: "", start: "" });
  useEffect(() => {
    if (booking) setF({ truckId: booking.truckId ?? "", driverId: booking.driverId ?? "", date: booking.date, start: booking.arrivalTime });
  }, [booking]);
  if (!cap.data) return null;
  if (!booking)
    return (
      <Panel title="Truck & driver">
        <p className="px-4 pb-4 text-sm text-slate-500">This booking isn't in the calendar. Add it on the Schedule.</p>
      </Panel>
    );
  const dirty = f.truckId !== (booking.truckId ?? "") || f.driverId !== (booking.driverId ?? "") || f.date !== booking.date || f.start !== booking.arrivalTime;
  const save = () =>
    cap.post(
      {
        action: "saveTrip",
        notifyCustomer: booking.customerNoticeWanted && Boolean(booking.customerEmail),
        trip: {
          id: booking.id,
          truckId: f.truckId,
          date: f.date,
          start: f.start,
          end: fromMinutes(toMinutes(f.start) + booking.estimatedMinutes),
          movers: booking.movers,
          driverId: f.driverId || null,
          customerName: booking.customerName,
          phone: booking.phone,
          customerEmail: booking.customerEmail,
          fromText: booking.fromText,
          toText: booking.toText,
          notes: booking.notes,
        },
      },
      "Saved. The driver and customer get the updated details.",
    );
  const sel = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <Panel title="Truck & driver" aside={<span className="text-xs text-slate-500">{time12(booking.arrivalTime)} – {time12(tripEnd(booking))}</span>}>
      <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 text-xs font-semibold text-slate-500">
        <label className="grid gap-1">
          Truck
          <select className={sel} value={f.truckId} onChange={(e) => setF({ ...f, truckId: e.target.value })}>
            {cap.data.trucks.filter((t) => t.id && (t.active || t.id === booking.truckId)).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.truckType}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Driver
          <select className={sel} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
            <option value="">No driver yet</option>
            {cap.data.drivers.filter((d) => d.id && (d.active || d.id === booking.driverId)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Date
          <input type="date" className={sel} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        <label className="grid gap-1">
          Arrive
          <input type="time" className={sel} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </label>
        {cap.message && <p className={clsx("col-span-2 text-sm font-normal", cap.message.error ? "text-red-600" : "text-green-700")}>{cap.message.text}</p>}
        {!booking.driverName?.trim() && !dirty && <p className="col-span-2 text-sm font-bold text-red-600">No driver picked yet.</p>}
        <div className="col-span-2">
          <button type="button" disabled={!dirty || cap.busy} onClick={() => void save()} className="rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
            Save changes
          </button>
        </div>
      </div>
    </Panel>
  );
}
