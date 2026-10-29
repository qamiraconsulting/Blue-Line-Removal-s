import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { shortDay } from "../../lib/noticeTiming";
import { time12 } from "../../lib/truckTrips";
import { CHANNEL_LABEL, JOB_STATUS_LABEL, jobStatuses, type JobStatus } from "../../server/jobs/status";
import { useCapacity } from "../admin/capacityShared";
import { REASONS } from "../admin/JobCard";
import { aud, useJobs, type Job } from "../admin/useJobs";
import { addDays, ChannelChip, jobPrice, melbourneToday, needsDriver, Notice, route, StatusPill } from "./shared";

// Requests: every request from every channel in one place -- a board by status, or a table
// that also holds the closed ones. Replaces Lead review's lists and Overview's "All requests
// in this period" list, so each request has one home.

const BOARD: JobStatus[] = ["waiting_for_quote", "estimate_sent", "quoted", "booking_requested", "booked"];
const CLOSED: JobStatus[] = ["completed", "cancelled", "rejected", "lost"];
type StatusFilter = "open" | "closed" | "all" | JobStatus;

export default function Requests() {
  const navigate = useNavigate();
  const today = useMemo(melbourneToday, []);
  const range = useMemo(() => ({ from: addDays(today, -89), to: today }), [today]);
  const jobs = useJobs(range);
  const cap = useCapacity();
  const [mode, setMode] = useState<"board" | "table">("board");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [q, setQ] = useState("");

  const all = jobs.data?.jobs ?? [];
  const needle = q.trim().toLowerCase();
  const list = all.filter(
    (j) =>
      (channel === "all" || j.channel === channel) &&
      (!needle || [j.customerName, j.fromText, j.toText, j.reference, j.phone, j.email].join(" ").toLowerCase().includes(needle)),
  );
  const noDriverRefs = new Set((cap.data?.bookings ?? []).filter((b) => needsDriver(b, today)).map((b) => b.quoteReference));
  const channels = [...new Set(all.map((j) => j.channel))].sort();
  const setOpen = (ref: string) => navigate(`/admin/new/jobs/${ref}`);

  const card = (j: Job) => {
    const price = jobPrice(j);
    return (
      <button key={j.reference} type="button" onClick={() => setOpen(j.reference)} className="grid gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-navy-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold text-navy">{j.customerName}</span>
          <span className="font-bold tabular-nums">{price !== null ? aud(price) : <span className="font-normal text-slate-400">no price</span>}</span>
        </span>
        <span className="text-[12.5px] text-slate-600">
          {route(j)} · {j.movingDate ? shortDay(j.movingDate) : "no date"}
          {j.arrivalTime && j.status !== "waiting_for_quote" && ` ${time12(j.arrivalTime)}`}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold">
          <ChannelChip channel={j.channel} />
          {j.depositStatus === "paid" && <span className="text-eco">Deposit paid</span>}
          {noDriverRefs.has(j.reference) && <span className="text-red-600">No driver</span>}
          {j.toComplete && <span className="text-action-dim">Mark complete</span>}
          {j.status === "waiting_for_quote" && <span className="text-action-dim">{(j.manualReason && REASONS[j.manualReason]) ?? "Needs a quote"}</span>}
          {j.testMode && <span className="text-slate-400">TEST</span>}
        </span>
      </button>
    );
  };

  const rows = list
    .filter((j) => (status === "open" ? !CLOSED.includes(j.status) : status === "closed" ? CLOSED.includes(j.status) : status === "all" || j.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-black text-navy">Requests</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-slate-600">Every request from the website form, the chat, phone, Airtasker and Moval, from first contact to booked.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="View">
            {(["board", "table"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={clsx("px-3 py-1.5 text-sm font-semibold capitalize", mode === m ? "bg-navy text-white" : "text-slate-600")}>
                {m}
              </button>
            ))}
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, suburb or reference" aria-label="Search requests" className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="all">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c] ?? c}
              </option>
            ))}
          </select>
          {mode === "table" && (
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
              {jobStatuses.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <Notice text={jobs.error} error />
      {!jobs.data && !jobs.error && <p className="text-sm text-slate-500">Loading...</p>}

      {jobs.data && mode === "board" && (
        <>
          <div className="overflow-x-auto pb-1.5">
            <div className="grid min-w-[1180px] grid-cols-5 gap-3">
              {BOARD.map((st) => {
                const items = list.filter((j) => j.status === st).sort((a, b) => (st === "booked" ? (a.movingDate ?? "").localeCompare(b.movingDate ?? "") : b.createdAt.localeCompare(a.createdAt)));
                const sum = items.reduce((n, j) => n + (jobPrice(j) ?? 0), 0);
                return (
                  <div key={st} className="grid content-start gap-2 rounded-xl bg-paper-2 p-2.5">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <StatusPill status={st} />
                      <span className="text-[11.5px] tabular-nums text-slate-500">
                        {items.length}
                        {sum > 0 && ` · ${aud(sum)}`}
                      </span>
                    </div>
                    {items.length ? items.map(card) : <p className="px-1 py-1.5 text-xs text-slate-400">None</p>}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-slate-500">Completed, cancelled, rejected and lost requests (last 90 days) are in the Table view.</p>
        </>
      )}

      {jobs.data && mode === "table" && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Move</th>
                <th className="px-3 py-2.5">Channel</th>
                <th className="px-3 py-2.5">Move date</th>
                <th className="px-3 py-2.5 text-right">Price</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    No requests match.
                  </td>
                </tr>
              )}
              {rows.map((j) => (
                <tr key={j.reference} onClick={() => setOpen(j.reference)} className="cursor-pointer border-b border-slate-100 hover:bg-paper">
                  <td className="px-3 py-2.5 font-bold text-navy">{j.customerName}</td>
                  <td className="px-3 py-2.5">{route(j)}</td>
                  <td className="px-3 py-2.5">
                    <ChannelChip channel={j.channel} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{j.movingDate ? shortDay(j.movingDate) : ""}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{aud(jobPrice(j))}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-400">{j.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

    </div>
  );
}
