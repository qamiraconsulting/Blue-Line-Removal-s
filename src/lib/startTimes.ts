// Arrival times the chat can book (Ayesha, 2026-10-28): set as "every N minutes from the first
// start to the last start" instead of a typed list, and "no finish time" for a 24/7 business.
// The Settings page turns those three boxes into the list stored in booking_settings.arrival_times.
// Pure, shared by the Settings page and the server.

/** Stored as the "Jobs must finish by" time when there is no finish time (works 24/7). */
export const NO_FINISH_TIME = "24:00";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const fromMinutes = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** "06:00".."20:00" every 30 minutes -> ["06:00", "06:30", ..., "20:00"]. Empty when the boxes don't make sense. */
export function startTimesBetween(first: string, last: string, everyMinutes: number): string[] {
  if (!isTime(first) || !isTime(last) || !(everyMinutes >= 5 && everyMinutes <= 240)) return [];
  const out: string[] = [];
  for (let t = toMinutes(first); t <= toMinutes(last); t += everyMinutes) out.push(fromMinutes(t));
  return out;
}

/** The three boxes back from a stored list (the step is the gap between the first two times). */
export function startTimesSummary(times: readonly string[]): { first: string; last: string; everyMinutes: number } {
  const sorted = [...times].sort();
  const step = sorted.length > 1 ? toMinutes(sorted[1]!) - toMinutes(sorted[0]!) : 30;
  return { first: sorted[0] ?? "", last: sorted[sorted.length - 1] ?? "", everyMinutes: step > 0 ? step : 30 };
}

/**
 * The free times closest to the one the customer asked for, nearest first, up to `count`.
 * With no time asked for, a spread across the day: the earliest, one around midday, the latest.
 */
export function nearestTimes(free: readonly string[], wanted: string | null | undefined, count = 3): string[] {
  if (free.length <= count) return [...free];
  if (wanted && /^\d{2}:\d{2}$/.test(wanted)) {
    const w = toMinutes(wanted);
    return [...free]
      .sort((a, b) => Math.abs(toMinutes(a) - w) - Math.abs(toMinutes(b) - w) || toMinutes(a) - toMinutes(b))
      .slice(0, count)
      .sort();
  }
  const pick = new Set([free[0]!, free[Math.floor(free.length / 2)]!, free[free.length - 1]!]);
  return [...pick].sort();
}
