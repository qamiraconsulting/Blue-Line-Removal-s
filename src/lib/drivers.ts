// Who drives a trip. Pure, shared by the server (who to email) and the dashboard (who to show).
//
// Each truck has one usual driver. A trip uses that driver unless someone else was picked for
// that one trip (driverId -- a cover driver) or an older free-typed name is on it (driverName).

export interface DriverLike {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface TripDriverFields {
  truckId: string | null;
  driverId?: string | null;
  driverName?: string | null;
}

export interface ResolvedDriver {
  /** null = an older typed name with no driver record (so nobody to email). */
  driver: DriverLike | null;
  name: string;
  /** Someone other than the truck's usual driver. */
  isCover: boolean;
}

export function resolveDriver(
  trip: TripDriverFields,
  trucks: { id: string; driverId: string | null }[],
  drivers: DriverLike[],
): ResolvedDriver | null {
  const byId = (id: string | null | undefined) => (id ? (drivers.find((d) => d.id === id) ?? null) : null);
  const usual = byId(trucks.find((t) => t.id === trip.truckId)?.driverId);

  const picked = byId(trip.driverId);
  if (picked) return { driver: picked, name: picked.name, isCover: picked.id !== usual?.id };

  const typed = trip.driverName?.trim();
  if (typed) return { driver: null, name: typed, isCover: true };

  return usual ? { driver: usual, name: usual.name, isCover: false } : null;
}
