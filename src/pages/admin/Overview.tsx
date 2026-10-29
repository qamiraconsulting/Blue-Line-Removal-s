import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { CHANNEL_LABEL, JOB_STATUS_LABEL, jobStatuses, type JobStatus } from "../../server/jobs/status";
import { JobCard } from "./JobCard";
import { aud, useJobs } from "./useJobs";

// Overview: a first-level, at-a-glance view of every request from every channel -- website
// form, chat, Matt's Google Form (phone, Airtasker, Moval...) -- for day-to-day performance
// (Ayesha, 2026-10-15). Numbers only (Blue Line, 28 Oct: nothing shown twice): tiles, a channel x
// status table and the period's requests. The lists that need someone live on their own tabs --
// estimates not booked yet on Lead review; upcoming jobs and "to mark complete" on Booking and trucks.

function melbourneToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
}
function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const PERIODS = {
  week: { label: "Last 7 days", range: (t: string) => ({ from: addDays(t, -6), to: t }) },
  month: { label: "Last 30 days", range: (t: string) => ({ from: addDays(t, -29), to: t }) },
  thisMonth: { label: "This month", range: (t: string) => ({ from: `${t.slice(0, 7)}-01`, to: t }) },
  quarter: { label: "Last 90 days", range: (t: string) => ({ from: addDays(t, -89), to: t }) },
} as const;

function waitedFor(since: string | null) {
  if (!since) return "";
  const mins = Math.round((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} days`;
}

export default function Overview() {
  const [period, setPeriod] = useState<keyof typeof PERIODS>("month");
  const range = useMemo(() => PERIODS[period].range(melbourneToday()), [period]);
  const { data, error, reload } = useJobs(range);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobStatus | "all">("all");

  const changed = (m: string) => {
    setNotice(m);
    reload();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading...</p>;

  const { summary: s, jobs } = data;
  const periodJobs = jobs.filter((j) => {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date(j.createdAt));
    return d >= range.from && d <= range.to && (filter === "all" || j.status === filter);
  });
  const waitingHours = s.now.oldestWaitingSince ? (Date.now() - new Date(s.now.oldestWaitingSince).getTime()) / 3_600_000 : 0;
  const channels = Object.keys(s.byChannel).sort((a, b) => (s.byChannel[b]?.total ?? 0) - (s.byChannel[a]?.total ?? 0));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-navy">Overview</h2>
        <div className="flex gap-1 text-xs">
          {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={clsx("rounded-full px-3 py-1 font-bold", period === p ? "bg-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
              {PERIODS[p].label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">Every request from the website form, the chat and Matt&apos;s Google Form (phone, Airtasker, Moval...), with its current status.</p>
      {!data.pdfQuotes && <p className="mt-2 text-xs text-slate-500">Branded PDF quotes aren&apos;t connected yet -- customers get the same figures as a plain email.</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">Right now</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Waiting for a quote" value={s.now.waitingForQuote} sub={s.now.oldestWaitingSince ? `oldest ${waitedFor(s.now.oldestWaitingSince)}` : "none waiting"} alert={waitingHours > 2} to="/admin/classic" />
        <Tile label="Booking requests" value={s.now.bookingRequested} sub="to confirm" alert={s.now.bookingRequested > 0} to="/admin/classic" />
        <Tile label="Booked, next 7 days" value={s.now.bookedNext7Days.jobs} sub={aud(s.now.bookedNext7Days.valueAud)} to="/admin/classic/trips" />
        <Tile label="Estimates & quotes not booked" value={s.now.estimatesNotBooked} sub="follow up" to="/admin/classic" />
        <Tile label="To mark complete" value={s.now.toMarkComplete} sub="moving date passed" alert={s.now.toMarkComplete > 0} to="/admin/classic/trips" />
      </div>

      <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">
        {PERIODS[period].label} ({range.from} to {range.to})
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Requests" value={s.inPeriod.requests} />
        <Tile label="Booked or done" value={s.inPeriod.booked} sub={s.inPeriod.conversionPercent === null ? "" : `${s.inPeriod.conversionPercent}% of requests`} />
        <Tile label="Completed" value={s.inPeriod.completed.jobs} sub={`${aud(s.inPeriod.completed.revenueAud)} charged`} />
        <Tile label="Lost / rejected" value={s.inPeriod.lost + s.inPeriod.rejected} sub={`${s.inPeriod.lost} lost, ${s.inPeriod.rejected} rejected`} />
        <Tile label="Cancelled" value={s.inPeriod.cancelled} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Channel</th>
              {jobStatuses.map((st) => (
                <th key={st} className="px-2 py-2 text-right font-semibold">
                  {JOB_STATUS_LABEL[st]}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={jobStatuses.length + 2} className="px-3 py-4 text-center text-slate-500">
                  No requests in this period.
                </td>
              </tr>
            )}
            {channels.map((c) => (
              <tr key={c} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold text-navy">{CHANNEL_LABEL[c] ?? c}</td>
                {jobStatuses.map((st) => (
                  <td key={st} className="px-2 py-2 text-right tabular-nums text-slate-700">
                    {s.byChannel[c]?.[st] ?? ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold tabular-nums">{s.byChannel[c]?.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-navy">All requests in this period</h2>
          <select className="rounded border border-slate-300 px-2 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as JobStatus | "all")}>
            <option value="all">All statuses</option>
            {jobStatuses.map((st) => (
              <option key={st} value={st}>
                {JOB_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
        {periodJobs.length === 0 ? <p className="mt-4 text-sm text-slate-500">None.</p> : <ul className="mt-4 space-y-3">{periodJobs.map((j) => <JobCard key={j.reference} job={j} onChanged={changed} />)}</ul>}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, alert, to }: { label: string; value: ReactNode; sub?: string; alert?: boolean; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={clsx("mt-1 font-display text-3xl font-bold", alert ? "text-action" : "text-navy")}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </>
  );
  const cls = clsx("block rounded-lg border bg-white p-3 shadow-sm", alert ? "border-action/50" : "border-slate-200");
  return to ? (
    <Link to={to} className={clsx(cls, "hover:border-navy")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
