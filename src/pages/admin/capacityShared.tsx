import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useAdminApi } from "./useAdminApi";

// What the "Settings" and "Booking and trucks" tabs share: the data from
// /api/admin/capacity, how they save, and the form building blocks.

export const TRUCK_TYPES = ["4.5T", "6-8T", "10T"] as const;

export interface Settings {
  autoConfirm: boolean;
  workingDays: number[];
  arrivalTimes: string[];
  dayEndTime: string | null;
  bufferMinutes: number | null;
  moversPerDay: number | null;
  minNoticeHours: number | null;
}
export interface Truck {
  id?: string;
  label: string;
  truckType: string;
  active: boolean;
  notes: string | null;
  /** The truck's usual driver. */
  driverId: string | null;
}
export interface Driver {
  id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
}
export interface Override {
  date: string;
  closed: boolean;
  moversAvailable: number | null;
  trucksUnavailable: string[];
  note: string | null;
}
export interface Booking {
  id: string;
  source: string;
  status: string;
  quoteReference: string | null;
  date: string;
  arrivalTime: string;
  estimatedMinutes: number;
  truckType: string;
  truckId: string | null;
  movers: number;
  /** Whoever actually drives it: a cover driver, or else the truck's usual driver. */
  driverName: string | null;
  /** Only set when someone other than the usual driver is covering this trip. */
  driverId: string | null;
  driverHasEmail: boolean;
  /** When the driver was last emailed about it. */
  driverNotifiedAt: string | null;
  /** The team asked for the customer to be emailed their booking details. */
  customerNoticeWanted: boolean;
  customerNotifiedAt: string | null;
  /** The day those emails go out: the day before the move. */
  noticeDueOn: string;
  customerName: string | null;
  phone: string | null;
  customerEmail: string | null;
  fromText: string | null;
  toText: string | null;
  notes: string | null;
}
export interface CapacityData {
  today: string;
  nowTime: string;
  from: string;
  to: string;
  tripDay: string;
  settings: Settings;
  trucks: Truck[];
  drivers: Driver[];
  overrides: Override[];
  bookings: Booking[];
  dayTrips: Booking[];
}
export type Range = { from?: string; to?: string; tripDay?: string };

export const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Blank is fine (the email is optional); otherwise it must look like an email address. */
export const looksLikeEmail = (v: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const box = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
export const input = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-action focus:outline-none";
export const button = "rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40";

/** A labelled field with a one-line explanation underneath the label. */
export function Field({ label, hint, children, className }: { label: string; hint: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block text-sm", className)}>
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="mb-1 block text-[11.5px] text-slate-400">{hint}</span>
      {children}
    </label>
  );
}

export function SectionHeader({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <>
      <h3 className="font-display text-lg font-extrabold text-navy">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{intro}</p>
    </>
  );
}

/** Loads the capacity data and saves changes (each save reloads it). */
export function useCapacity() {
  const { adminFetch } = useAdminApi();
  const [data, setData] = useState<CapacityData | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [range, setRange] = useState<Range>({});
  const [busy, setBusy] = useState(false);

  async function load(r = range) {
    const qs = new URLSearchParams(Object.entries(r).filter(([, v]) => v) as [string, string][]).toString();
    const res = await adminFetch(`/api/admin/capacity${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      setMessage({ text: (await res.json()).error ?? "Couldn't load", error: true });
      return null;
    }
    const d = (await res.json()) as CapacityData;
    setData(d);
    return d;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), []);

  /** Returns the error shown, or null when it saved. */
  async function post(body: unknown, done: string): Promise<string | null> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/capacity", { method: "POST", body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't save");
      const base = out.capacityWarning ? `${done} -- note: the calendar didn't show room (${out.capacityWarning.replace(/_/g, " ")}).` : done;
      // What was emailed (or couldn't be): "Driver emailed the job. Customer emailed."
      const notices: string[] = Array.isArray(out.notices) ? out.notices : [];
      setMessage({ text: [base, ...notices].join(" "), error: notices.some((n) => n.includes("NOT")) });
      await load();
      return null;
    } catch (err) {
      const text = err instanceof Error ? err.message : "Couldn't save";
      setMessage({ text, error: true });
      return text;
    } finally {
      setBusy(false);
    }
  }

  function changeRange(next: Range) {
    const merged = { ...range, ...next };
    setRange(merged);
    void load(merged);
  }

  return { data, message, busy, range, setRange, load, post, changeRange };
}
