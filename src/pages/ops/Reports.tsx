import { useMemo, useState } from "react";
import clsx from "clsx";
import { CHANNEL_LABEL, JOB_STATUS_LABEL, jobStatuses } from "../../server/jobs/status";
import { useAdminRole } from "../admin/useAdminRole";
import { aud, useJobs } from "../admin/useJobs";
import { addDays, melbourneToday, Notice } from "./shared";

// Reports: how requests turn into jobs, and where they come from -- the current Overview's
// numbers, moved off the home screen so Today shows the work to do. Full users only.

const PERIODS = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["month", "This month"],
  ["90", "90 days"],
] as const;
type Period = (typeof PERIODS)[number][0];

export default function Reports() {
  const role = useAdminRole();
  const today = useMemo(melbourneToday, []);
  const [period, setPeriod] = useState<Period>("30");
  const range = useMemo(() => ({ from: period === "month" ? `${today.slice(0, 7)}-01` : addDays(today, -(Number(period) - 1)), to: today }), [period, today]);
  const { data, error } = useJobs(range);

  if (role === "limited") return <p className="text-sm text-slate-600">Reports are for full dashboard users.</p>;
  const s = data?.summary.inPeriod;
  const inPeriod = (data?.jobs ?? []).filter((j) => {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date(j.createdAt));
    return d >= range.from && d <= range.to;
  });
  const priced = inPeriod.filter((j) => j.status !== "waiting_for_quote" && j.status !== "rejected").length;
  const funnel: [string, number][] = s
    ? [
        ["Requests", s.requests],
        ["Priced", priced],
        ["Booked or done", s.booked],
        ["Completed", s.completed.jobs],
      ]
    : [];
  const max = Math.max(1, s?.requests ?? 1);
  const byChannel = data?.summary.byChannel ?? {};
  const channels = Object.keys(byChannel).sort((a, b) => (byChannel[b]?.total ?? 0) - (byChannel[a]?.total ?? 0));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-black text-navy">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            How requests turn into jobs, and where they come from. {range.from} to {range.to}.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="Period">
          {PERIODS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)} className={clsx("px-3 py-1.5 text-sm font-semibold", period === id ? "bg-navy text-white" : "text-slate-600")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Notice text={error} error />
      {!data && !error && <p className="text-sm text-slate-500">Loading...</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Requests" value={s.requests} sub="from every channel" />
            <Tile label="Booked" value={s.conversionPercent === null ? "-" : `${s.conversionPercent}%`} sub={`${s.booked} of ${s.requests} requests`} />
            <Tile label="Completed" value={aud(s.completed.revenueAud)} sub={`${s.completed.jobs} jobs${s.completed.jobs ? ` · avg ${aud(Math.round(s.completed.revenueAud / s.completed.jobs))}` : ""}`} />
            <Tile label="Lost, rejected, cancelled" value={s.lost + s.rejected + s.cancelled} sub={`${s.lost} lost, ${s.rejected} rejected, ${s.cancelled} cancelled`} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Bars title="From request to job" rows={funnel} max={max} cls="bg-navy-3" last="bg-eco" />
            <Bars title="Where requests come from" rows={channels.map((c) => [CHANNEL_LABEL[c] ?? c, byChannel[c]?.total ?? 0])} max={max} cls="bg-action" />
          </div>

          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <h2 className="px-4 pt-3.5 pb-2 font-display text-lg font-extrabold text-navy">Channel by status</h2>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Channel</th>
                  {jobStatuses.map((st) => (
                    <th key={st} className="px-2 py-2 text-right">
                      {JOB_STATUS_LABEL[st]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {channels.length === 0 && (
                  <tr>
                    <td colSpan={jobStatuses.length + 2} className="px-3 py-4 text-slate-500">
                      No requests in this period.
                    </td>
                  </tr>
                )}
                {channels.map((c) => (
                  <tr key={c} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-bold text-navy">{CHANNEL_LABEL[c] ?? c}</td>
                    {jobStatuses.map((st) => (
                      <td key={st} className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {byChannel[c]?.[st] ?? ""}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{byChannel[c]?.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-display text-[26px] font-black leading-tight text-navy tabular-nums">{value}</span>
      <span className="text-xs text-slate-500">{sub}</span>
    </div>
  );
}

function Bars({ title, rows, max, cls, last }: { title: string; rows: [string, number][]; max: number; cls: string; last?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="px-4 pt-3.5 pb-2 font-display text-lg font-extrabold text-navy">{title}</h2>
      <div className="grid gap-2 px-4 pb-4">
        {rows.length === 0 && <p className="text-sm text-slate-500">None.</p>}
        {rows.map(([label, n], i) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)_40px] items-center gap-2.5 text-sm">
            <span>{label}</span>
            <span className="h-[22px] overflow-hidden rounded bg-paper-2">
              <i className={clsx("block h-full rounded", last && i === rows.length - 1 ? last : cls)} style={{ width: `${Math.min(100, (n / max) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums">{n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
