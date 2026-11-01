import type { ReactNode } from "react";
import clsx from "clsx";
import { CHANNEL_LABEL, JOB_STATUS_LABEL, type JobStatus } from "../../server/jobs/status";
import type { AdminRole } from "../admin/useAdminRole";
import { STATUS_STYLE } from "../admin/JobCard";
import type { Booking } from "../admin/capacityShared";
import type { Job } from "../admin/useJobs";

// Pieces shared by the new dashboard's screens (Today, Requests).

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={clsx("whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold", STATUS_STYLE[status])}>{JOB_STATUS_LABEL[status]}</span>;
}

export function ChannelChip({ channel }: { channel: string }) {
  return <span className="whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-500">{CHANNEL_LABEL[channel] ?? channel}</span>;
}

export const jobPrice = (j: Job) => j.finalAmountAud ?? j.quotedAmountAud ?? j.estimateAud;
export const route = (j: Pick<Job, "need" | "fromText" | "toText">) => (j.need === "junk" ? "Junk removal" : `${j.fromText ?? "?"} → ${j.toText ?? "?"}`);

/**
 * What each user may do with a job. Matt (limited) handles bookings only: he can cancel one,
 * but quotes, confirming, rejecting and completing are for full users (Blue Line, Oct 2026).
 * The screens hide the rest; the server check comes in phase 3.
 */
export function allowedActions(job: Job, role: AdminRole | null): Job["actions"] {
  if (role === "full") return job.actions;
  return job.status === "booked" ? job.actions.filter((a) => a === "cancel") : [];
}

export const melbourneToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "18 min", "5 h", "3 days" since an ISO time. */
export function waited(since: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} days`;
}

/** No driver picked for a confirmed, upcoming booking -- the same test as Booking and trucks. */
export const needsDriver = (b: Booking, today: string) => b.status === "confirmed" && !b.driverName?.trim() && b.date >= today;

export function Panel({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h2 className="font-display text-lg font-extrabold text-navy">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <p className={clsx("rounded-lg border px-3 py-2 text-sm", error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800")}>{text}</p>;
}
