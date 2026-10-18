// When the driver's "New job" email and the customer's booking email go out (Ayesha, 2026-10-18):
// the DAY BEFORE the move, not when the truck and driver are assigned. Dates are Melbourne dates
// (Australia/Melbourne). Pure, so it is shared and tested without a clock.
//
//  - The move is today or tomorrow (the day before is today or already past): send straight away.
//  - Otherwise: wait. The hourly job (api/cron/notices.ts) sends it from NOTICE_HOUR on the day
//    before.
//
// Nothing is stored for "waiting": the emails are built from the booking as it is at send time,
// so a new date, driver or truck before then is picked up, and a cancelled booking sends nothing.

/** The hour (Melbourne, 24h) the day-before emails go out when they are not sent straight away. */
export const NOTICE_HOUR = 9;

export type NoticeMode =
  /** Right after someone saves a booking or trip: send now only if the day before has arrived. */
  | "assign"
  /** The hourly job: also sends the ones whose time has come (from NOTICE_HOUR on the day before). */
  | "cron";

const toUtcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

const fromUtcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The day after a date. */
export const dayAfter = (iso: string) => fromUtcDay(toUtcDay(iso) + 86_400_000);

/** The day the emails are due: the day before the move. */
export const noticeDate = (moveDate: string) => fromUtcDay(toUtcDay(moveDate) - 86_400_000);

export interface NoticeTiming {
  due: boolean;
  /** The Melbourne date they go out (the day before the move). */
  sendOn: string;
}

/**
 * `nowLocal` is Melbourne wall-clock "YYYY-MM-DDTHH:MM". A move that has already happened is
 * never due (nobody wants a "your move is tomorrow" email afterwards).
 */
export function noticeTiming(moveDate: string, nowLocal: string, mode: NoticeMode = "assign"): NoticeTiming {
  const today = nowLocal.slice(0, 10);
  const hour = Number(nowLocal.slice(11, 13));
  const sendOn = noticeDate(moveDate);
  if (moveDate < today) return { due: false, sendOn };
  if (mode === "assign") return { due: today >= sendOn, sendOn };
  return { due: today > sendOn || (today === sendOn && hour >= NOTICE_HOUR), sendOn };
}

/** "Mon 19 Oct" for a YYYY-MM-DD date. */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { ...o, timeZone: "UTC" });
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
}
