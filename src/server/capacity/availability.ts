// Which arrival times are free for a job, and whether the chat may confirm it on the spot.
// A PURE function over a snapshot of what the Blue Line team keeps on the dashboard
// (settings, trucks, day changes, the booking calendar) -- no database, no clock.
//
// Never guesses: any setting the team hasn't filled in means "the team confirms", not a
// default. Capacity model, per arrival time:
//  - the job occupies [arrival, arrival + estimated time + buffer] and must end by day end;
//  - a truck of the job's size must be free for that whole window (trucks off that day and
//    other bookings' trucks excluded; bookings without a truck still use one of that size).
//    If none is, another free truck can still do it -- a smaller one in more trips (Blue Line,
//    2026-10-14: never turn a job away just because the bigger truck is busy). Such a time is
//    still offered, but never confirmed instantly: the team decides;
//  - the movers on all jobs overlapping the window, plus this one, fit the day's movers.

export interface CapacitySettings {
  autoConfirm: boolean;
  workingDays: number[]; // 0 = Sunday
  arrivalTimes: string[]; // "HH:MM"
  dayEndTime: string | null;
  bufferMinutes: number | null;
  moversPerDay: number | null;
  minNoticeHours: number | null;
  maxDaysAhead: number | null;
  autoConfirmMaxAud: number | null;
}

export interface CapacityTruck {
  id: string;
  truckType: string;
  active: boolean;
}

export interface DayOverride {
  closed: boolean;
  moversAvailable: number | null;
  trucksUnavailable: string[];
}

export interface CalendarBooking {
  arrivalTime: string;
  estimatedMinutes: number;
  truckType: string;
  truckId: string | null;
  movers: number;
}

export interface CapacitySnapshot {
  settings: CapacitySettings;
  trucks: CapacityTruck[];
  override: DayOverride | null; // for the requested date
  bookings: CalendarBooking[]; // confirmed bookings on the requested date
  /** Melbourne wall-clock "now", "YYYY-MM-DDTHH:MM". */
  nowLocal: string;
}

export interface JobRequest {
  date: string; // YYYY-MM-DD
  truckType: string;
  movers: number;
  estimatedMinutes: number;
  amountAud: number;
}

export type SlotUnavailableReason = "outside_working_hours" | "too_soon" | "no_truck" | "no_movers";
export type DayUnavailableReason = "not_set_up" | "not_a_working_day" | "closed" | "too_far_ahead" | "in_the_past";

export interface SlotResult {
  time: string;
  available: boolean;
  reason?: SlotUnavailableReason;
  /** The free truck that would be assigned. */
  truckId?: string;
  /**
   * Set when no truck of the job's size is free and a different one would go instead
   * (a smaller truck doing more trips, or failing that a bigger one). The team confirms these.
   */
  substituteTruckType?: string;
}

// Smallest to largest. A substitute is tried closest-smaller first, then closest-bigger.
const SIZE_ORDER = ["4.5T", "6-8T", "10T"];

export interface AvailabilityResult {
  /** Arrival times are set up and the day can take bookings at all. */
  dayOpen: boolean;
  dayReason?: DayUnavailableReason;
  slots: SlotResult[];
  /** Booking a free slot would be confirmed on the spot (switch on, everything set, under the limit). */
  instantConfirm: boolean;
  /** Why instant confirmation is off for this job, for the team's logs. */
  instantConfirmBlockedBy: string[];
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const dayIndex = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
// Minutes between two Melbourne wall-clock times (DST shifts ignored -- at most an hour off a notice period).
const wallClockMinutes = (iso: string, hhmm: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 60000 + toMinutes(hhmm);
};

export function checkAvailability(job: JobRequest, snap: CapacitySnapshot): AvailabilityResult {
  const s = snap.settings;
  const [todayIso, nowTime] = snap.nowLocal.split("T") as [string, string];
  const closedDay = (reason: DayUnavailableReason): AvailabilityResult => ({
    dayOpen: false,
    dayReason: reason,
    slots: [],
    instantConfirm: false,
    instantConfirmBlockedBy: [reason],
  });

  // What's needed just to offer times at all.
  if (!s.arrivalTimes.length || !s.workingDays.length || s.dayEndTime === null || s.moversPerDay === null) {
    return closedDay("not_set_up");
  }
  if (job.date < todayIso) return closedDay("in_the_past");
  if (!s.workingDays.includes(dayIndex(job.date))) return closedDay("not_a_working_day");
  if (snap.override?.closed) return closedDay("closed");
  const daysAhead = (wallClockMinutes(job.date, "00:00") - wallClockMinutes(todayIso, "00:00")) / 1440;
  if (s.maxDaysAhead !== null && daysAhead > s.maxDaysAhead) return closedDay("too_far_ahead");

  const buffer = s.bufferMinutes ?? 0;
  const dayEnd = toMinutes(s.dayEndTime);
  const moversCap = snap.override?.moversAvailable ?? s.moversPerDay;
  const offToday = new Set(snap.override?.trucksUnavailable ?? []);

  const slots = [...s.arrivalTimes].sort().map((time): SlotResult => {
    const start = toMinutes(time);
    const end = start + job.estimatedMinutes + buffer;
    if (end > dayEnd) return { time, available: false, reason: "outside_working_hours" };

    const noticeMinutes = wallClockMinutes(job.date, time) - wallClockMinutes(todayIso, nowTime);
    if (noticeMinutes < (s.minNoticeHours ?? 0) * 60) return { time, available: false, reason: "too_soon" };

    const overlapping = snap.bookings.filter((b) => {
      const bStart = toMinutes(b.arrivalTime);
      const bEnd = bStart + b.estimatedMinutes + buffer;
      return bStart < end && start < bEnd;
    });

    const busyTrucks = new Set(overlapping.map((b) => b.truckId).filter((id): id is string => Boolean(id)));
    // A free truck of a given size: not booked, and not needed by a booking of that size
    // that has no truck assigned yet.
    const freeOfSize = (size: string) => {
      const unassigned = overlapping.filter((b) => !b.truckId && b.truckType === size).length;
      const free = snap.trucks.filter((t) => t.active && t.truckType === size && !offToday.has(t.id) && !busyTrucks.has(t.id));
      return free.length > unassigned ? free[unassigned]!.id : null;
    };

    let truckId = freeOfSize(job.truckType);
    let substituteTruckType: string | undefined;
    if (!truckId) {
      const at = SIZE_ORDER.indexOf(job.truckType);
      const smaller = SIZE_ORDER.slice(0, Math.max(at, 0)).reverse();
      const bigger = at >= 0 ? SIZE_ORDER.slice(at + 1) : [];
      for (const size of [...smaller, ...bigger]) {
        truckId = freeOfSize(size);
        if (truckId) {
          substituteTruckType = size;
          break;
        }
      }
    }
    if (!truckId) return { time, available: false, reason: "no_truck" };

    const moversInUse = overlapping.reduce((sum, b) => sum + b.movers, 0);
    if (moversInUse + job.movers > moversCap) return { time, available: false, reason: "no_movers" };

    return substituteTruckType ? { time, available: true, truckId, substituteTruckType } : { time, available: true, truckId };
  });

  const blockedBy: string[] = [];
  if (!s.autoConfirm) blockedBy.push("auto_confirm_off");
  if (s.minNoticeHours === null) blockedBy.push("min_notice_not_set");
  if (s.maxDaysAhead === null) blockedBy.push("max_days_ahead_not_set");
  if (s.bufferMinutes === null) blockedBy.push("buffer_not_set");
  if (s.autoConfirmMaxAud !== null && job.amountAud > s.autoConfirmMaxAud) blockedBy.push("over_auto_confirm_limit");

  return { dayOpen: true, slots, instantConfirm: blockedBy.length === 0, instantConfirmBlockedBy: blockedBy };
}
