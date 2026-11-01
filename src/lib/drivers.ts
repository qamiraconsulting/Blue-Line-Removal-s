// Who drives a trip. Pure, shared by the server (who to email) and the dashboard (who to show).
//
// The driver is picked for each job by hand (Blue Line, 28 Oct 2026): the dispatcher assigns
// one at least 2 days before the move. There is no "usual driver" per truck any more -- a job
// with no driver picked has no driver (and is flagged; see src/server/notify/noDriverAlert.ts).
// An older free-typed name on a trip (driverName) still shows, with nobody to email.

export interface DriverLike {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface TripDriverFields {
  driverId?: string | null;
  driverName?: string | null;
}

export interface ResolvedDriver {
  /** null = an older typed name with no driver record (so nobody to email). */
  driver: DriverLike | null;
  name: string;
}

export function resolveDriver(trip: TripDriverFields, drivers: DriverLike[]): ResolvedDriver | null {
  const picked = trip.driverId ? drivers.find((d) => d.id === trip.driverId) : undefined;
  if (picked) return { driver: picked, name: picked.name };
  const typed = trip.driverName?.trim();
  return typed ? { driver: null, name: typed } : null;
}

/** A confirmed job still needs a driver from 2 days before the move (Blue Line, 28 Oct). */
export const DRIVER_NEEDED_DAYS_BEFORE = 2;

/** True when the move is within DRIVER_NEEDED_DAYS_BEFORE days of today (or today/past). */
export function driverOverdue(moveDate: string, today: string): boolean {
  const days = (Date.parse(`${moveDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= DRIVER_NEEDED_DAYS_BEFORE;
}
