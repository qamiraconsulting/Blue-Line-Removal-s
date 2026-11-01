// Truck trips: which truck is out when. A trip is a calendar booking with a named truck --
// the same rows the chat reads, so a trip blocks that truck for the chat too. Pure helpers,
// shared by the dashboard (live warnings, the day view) and the server (the real check).

export interface TripLike {
  id: string;
  truckId: string | null;
  date: string; // YYYY-MM-DD
  arrivalTime: string; // "HH:MM"
  estimatedMinutes: number;
  status: string; // "confirmed" | "cancelled"
  driverName?: string | null;
  customerName?: string | null;
  quoteReference?: string | null;
  notes?: string | null;
}

export interface TripDraft {
  id?: string; // set when editing
  truckId: string;
  date: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  driverName?: string | null;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export const fromMinutes = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** "08:00" -> "8:00 AM". */
export function time12(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mins % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const tripEnd = (t: Pick<TripLike, "arrivalTime" | "estimatedMinutes">) => fromMinutes(toMinutes(t.arrivalTime) + t.estimatedMinutes);

export type TripProblem =
  | { kind: "bad_times" }
  | { kind: "truck_off" }
  | { kind: "clash"; with: TripLike }
  | { kind: "driver_clash"; with: TripLike };

const sameDriver = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " "));

/**
 * Why this trip can't be saved, or null. A truck can't be on two trips whose times overlap
 * on the same day (back-to-back is fine: 8-11 then 11-2), and can't go out on a day it's
 * marked off. Nor can the same driver (matched by name) drive two overlapping trips.
 */
export function tripProblem(draft: TripDraft, existing: TripLike[], trucksOffThatDay: string[] = []): TripProblem | null {
  if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end) || toMinutes(draft.end) <= toMinutes(draft.start)) {
    return { kind: "bad_times" };
  }
  if (trucksOffThatDay.includes(draft.truckId)) return { kind: "truck_off" };
  const start = toMinutes(draft.start);
  const end = toMinutes(draft.end);
  const overlapping = existing.filter((t) => {
    if (t.status !== "confirmed" || t.date !== draft.date || (draft.id && t.id === draft.id)) return false;
    const s = toMinutes(t.arrivalTime);
    return s < end && start < s + t.estimatedMinutes;
  });
  const clash = overlapping.find((t) => t.truckId === draft.truckId);
  if (clash) return { kind: "clash", with: clash };
  const driverClash = overlapping.find((t) => sameDriver(t.driverName, draft.driverName));
  return driverClash ? { kind: "driver_clash", with: driverClash } : null;
}

export function describeProblem(p: TripProblem, truckName: string): string {
  if (p.kind === "bad_times") return "The end time must be after the start time, on the same day.";
  if (p.kind === "truck_off") return `${truckName} is marked off that day (Days off & changes).`;
  const who = p.with.customerName || p.with.quoteReference || p.with.notes || "another trip";
  const when = `${time12(p.with.arrivalTime)} - ${time12(tripEnd(p.with))}`;
  if (p.kind === "driver_clash") return `${p.with.driverName!.trim()} is already driving a trip ${when} (${who}). Pick another driver or time.`;
  return `${truckName} is already Assigned / Engaged ${when} (${who}). Pick another truck or time.`;
}

export interface Segment {
  start: string;
  end: string;
  engaged: boolean;
  trip?: TripLike;
}

/**
 * One truck's day, from dayStart to dayEnd, as Engaged (its trips) and Available (the gaps).
 * Trips running outside the window still show, stretching it.
 */
export function truckDay(truckId: string, trips: TripLike[], date: string, dayStart = "06:00", dayEnd = "20:00"): Segment[] {
  const mine = trips
    .filter((t) => t.truckId === truckId && t.date === date && t.status === "confirmed")
    .sort((a, b) => toMinutes(a.arrivalTime) - toMinutes(b.arrivalTime));
  const out: Segment[] = [];
  let cursor = Math.min(toMinutes(dayStart), ...mine.map((t) => toMinutes(t.arrivalTime)));
  const last = Math.max(toMinutes(dayEnd), ...mine.map((t) => toMinutes(t.arrivalTime) + t.estimatedMinutes));
  for (const t of mine) {
    const s = toMinutes(t.arrivalTime);
    const e = s + t.estimatedMinutes;
    if (s > cursor) out.push({ start: fromMinutes(cursor), end: fromMinutes(s), engaged: false });
    out.push({ start: t.arrivalTime, end: fromMinutes(e), engaged: true, trip: t });
    cursor = Math.max(cursor, e);
  }
  if (cursor < last) out.push({ start: fromMinutes(cursor), end: fromMinutes(last), engaged: false });
  return out;
}

/** The truck's status at a wall-clock time on that day. */
export function statusAt(segments: Segment[], hhmm: string): "Assigned / Engaged" | "Available" {
  const now = toMinutes(hhmm);
  return segments.some((s) => s.engaged && toMinutes(s.start) <= now && now < toMinutes(s.end)) ? "Assigned / Engaged" : "Available";
}
