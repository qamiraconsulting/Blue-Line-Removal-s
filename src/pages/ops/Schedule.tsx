import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { DRIVER_NEEDED_DAYS_BEFORE, driverOverdue } from "../../lib/drivers";
import { shortDay } from "../../lib/noticeTiming";
import { time12, toMinutes, tripEnd } from "../../lib/truckTrips";
import { useCapacity, type Booking, type CapacityData } from "../admin/capacityShared";
import { addDays, melbourneToday, needsDriver, Panel } from "./shared";
import { TruckDriver } from "./TripEditor";

// Schedule: which truck goes out when, and who drives it. The chat reads this same calendar, so
// it only offers customers times when a truck is free. Week and Day grids with the trucks as
// rows, the drivers for the day, and the jobs that still need a driver. A trip opens its job
// (truck, driver, time and cancelling are there); a trip with no job opens a small editor.
// New trips come from "+ New job".

const DAY_START = 7 * 60;
const DAY_END = 21 * 60; // Blue Line works 7am-9pm (28 Oct)

function mondayOf(iso: string) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}
const hasDriver = (b: Booking) => Boolean(b.driverName?.trim());
const tripStyle = (b: Booking) => (hasDriver(b) ? "border-eco bg-eco-wash" : "border-red-500 bg-red-50");

export default function Schedule() {
  const navigate = useNavigate();
  const today = useMemo(melbourneToday, []);
  const cap = useCapacity(); // the week (or day) on screen
  const upcoming = useCapacity(); // the next 30 days, for "Jobs with no driver yet"
  const [mode, setMode] = useState<"week" | "day">("week");
  const [week, setWeek] = useState(() => mondayOf(today));
  const [trip, setTrip] = useState<Booking | null>(null);
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)), [week]);

  useEffect(() => {
    cap.changeRange({ from: days[0], to: days[6] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const data = cap.data;
  const day = data?.tripDay ?? today;
  const open = (b: Booking) => (b.quoteReference ? navigate(`/admin/jobs/${b.quoteReference}`) : setTrip(b));
  const showDay = (d: string) => {
    cap.changeRange({ tripDay: d });
    setMode("day");
  };
  const shift = (n: number) => {
    if (mode === "week") setWeek(n === 0 ? mondayOf(today) : addDays(week, 7 * n));
    else cap.changeRange({ tripDay: n === 0 ? today : addDays(day, n) });
  };
  const reloadAll = () => {
    void cap.load();
    void upcoming.load();
  };
  const noDriver = (upcoming.data?.bookings ?? []).filter((b) => needsDriver(b, today)).sort((a, b) => `${a.date}${a.arrivalTime}`.localeCompare(`${b.date}${b.arrivalTime}`));
  const trucks = data?.trucks.filter((t) => t.active && t.id) ?? [];
  const btn = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold hover:border-navy";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-black text-navy">Schedule</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-slate-600">Which truck goes out when, and who drives it. The chat reads this same schedule, so it only offers customers times when a truck is free.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="Range">
            {(["week", "day"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={clsx("px-3 py-1.5 text-sm font-semibold capitalize", mode === m ? "bg-navy text-white" : "text-slate-600")}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" className={btn} onClick={() => shift(-1)} aria-label="Previous">
            &lsaquo;
          </button>
          <button type="button" className={btn} onClick={() => shift(0)}>
            Today
          </button>
          <button type="button" className={btn} onClick={() => shift(1)} aria-label="Next">
            &rsaquo;
          </button>
        </div>
      </div>
      {cap.message && <p className={clsx("text-sm", cap.message.error ? "text-red-600" : "text-green-700")}>{cap.message.text}</p>}

      <div className="flex flex-wrap gap-3.5 text-xs text-slate-600">
        <Key cls="bg-eco" label="Booked, driver set" />
        <Key cls="bg-red-500" label="No driver yet" />
        <Key cls="bg-slate-300" label="Day off / not working" />
      </div>

      {!data && <p className="text-sm text-slate-500">Loading...</p>}

      {data && mode === "week" && (
        <Panel title={`${shortDay(days[0])} – ${shortDay(days[6])}`} aside={<span className="text-sm text-slate-500 tabular-nums">{plural(data.bookings.filter((b) => b.status === "confirmed").length, "trip")}</span>}>
          <div className="overflow-x-auto">
            <div className="grid min-w-[960px] grid-cols-[128px_repeat(7,minmax(118px,1fr))] border-t border-slate-100 text-sm">
              <div className="bg-paper" />
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => showDay(d)}
                  className={clsx("border-l border-slate-100 bg-paper px-2 py-2 text-left text-xs font-bold hover:bg-paper-2", d === today ? "text-action-dim shadow-[inset_0_-2px_0_var(--color-action)]" : "text-slate-600")}
                >
                  {shortDay(d).split(" ")[0]}
                  <span className="block font-medium text-slate-400">{shortDay(d).split(" ").slice(1).join(" ")}</span>
                </button>
              ))}
              {trucks.map((t) => (
                <WeekRow key={t.id} truckId={t.id!} label={t.label} type={t.truckType} days={days} data={data} onOpen={open} />
              ))}
            </div>
          </div>
        </Panel>
      )}

      {data && mode === "day" && (
        <>
          <Panel title={`${shortDay(day)}${day === today ? " · Today" : ""}`} aside={<span className="text-sm text-slate-500">{offNote(data, day) ?? `${plural(data.dayTrips.filter((b) => b.status === "confirmed").length, "job")} · 7 am to 9 pm`}</span>}>
            <div className="overflow-x-auto">
              <div className="grid min-w-[860px] grid-cols-[128px_minmax(0,1fr)] border-t border-slate-100">
                <div />
                <div className="relative h-7 border-b border-slate-200">
                  {[7, 9, 11, 13, 15, 17, 19, 21].map((h) => (
                    <span key={h} className={clsx("absolute top-1.5 text-[11px] text-slate-400 tabular-nums", h === 7 ? "" : h === 21 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${((h * 60 - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}>
                      {h % 12 || 12} {h < 12 ? "am" : "pm"}
                    </span>
                  ))}
                </div>
                {trucks.map((t) => {
                  const mine = data.dayTrips.filter((b) => b.status === "confirmed" && b.truckId === t.id);
                  return (
                    <DayLane key={t.id} label={t.label} type={t.truckType} free={mine.length === 0}>
                      {mine.map((b) => {
                        const a = Math.max(DAY_START, toMinutes(b.arrivalTime));
                        const z = Math.min(DAY_END, toMinutes(b.arrivalTime) + b.estimatedMinutes);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => open(b)}
                            title={`${time12(b.arrivalTime)} – ${time12(tripEnd(b))}`}
                            className={clsx("absolute top-[7px] bottom-[7px] grid content-start overflow-hidden whitespace-nowrap rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11.5px] hover:brightness-95", tripStyle(b))}
                            style={{ left: `${((a - DAY_START) / (DAY_END - DAY_START)) * 100}%`, width: `${(Math.max(30, z - a) / (DAY_END - DAY_START)) * 100}%` }}
                          >
                            <b className="text-navy">
                              {time12(b.arrivalTime)}–{time12(tripEnd(b))}
                            </b>
                            <span className="truncate">
                              {b.customerName ?? b.notes ?? "Trip"} · {b.driverName?.trim() || "No driver"}
                            </span>
                          </button>
                        );
                      })}
                    </DayLane>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel title="Drivers this day">
            <table className="w-full border-t border-slate-100 text-sm">
              <tbody>
                {data.drivers.filter((d) => d.active).map((d) => {
                  const mine = data.dayTrips.filter((b) => b.status === "confirmed" && b.driverName?.trim() === d.name);
                  return (
                    <tr key={d.id ?? d.name} className="border-b border-slate-100 last:border-b-0">
                      <td className="w-48 px-4 py-2.5 font-bold text-navy">{d.name}</td>
                      <td className="px-4 py-2.5">
                        {mine.length ? (
                          mine.map((b, i) => (
                            <button key={b.id} type="button" onClick={() => open(b)} className="text-left hover:underline">
                              {i > 0 && "; "}
                              {time12(b.arrivalTime)} {b.customerName ?? "Trip"} ({trucks.find((t) => t.id === b.truckId)?.label ?? "no truck"})
                            </button>
                          ))
                        ) : (
                          <span className="text-slate-400">Free</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {upcoming.data && (
        <Panel title="Jobs with no driver yet" aside={<span className="text-xs text-slate-400">The team is emailed {DRIVER_NEEDED_DAYS_BEFORE} days before</span>}>
          <table className="w-full border-t border-slate-100 text-sm">
            <tbody>
              {noDriver.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400">Every upcoming job has a driver.</td>
                </tr>
              )}
              {noDriver.map((b) => (
                <tr key={b.id} onClick={() => open(b)} className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-paper">
                  <td className="px-4 py-2.5 font-bold text-navy">{b.customerName ?? b.quoteReference ?? "Trip"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {shortDay(b.date)} {time12(b.arrivalTime)}
                  </td>
                  <td className="px-4 py-2.5">{upcoming.data?.trucks.find((t) => t.id === b.truckId)?.label ?? "No truck"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {driverOverdue(b.date, today) ? <b className="text-red-600">Overdue</b> : <b className="text-action-dim">Pick by {shortDay(addDays(b.date, -DRIVER_NEEDED_DAYS_BEFORE))}</b>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {data && (
        <p className="text-xs text-slate-500">
          <button type="button" disabled={cap.busy} className="font-bold text-navy underline" onClick={() => void cap.post({ action: "sendDueNotices" }, "Checked for emails that are due.")}>
            Send due emails now
          </button>{" "}
          (the live site does this every hour; use this on the test link)
        </p>
      )}

      {trip && <TripDialog trip={(data?.bookings.find((b) => b.id === trip.id) ?? data?.dayTrips.find((b) => b.id === trip.id)) || trip} cap={cap} onClose={() => setTrip(null)} onSaved={reloadAll} />}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function offNote(data: CapacityData, d: string) {
  const off = data.overrides.find((o) => o.date === d && o.closed);
  if (off) return off.note ?? "Closed";
  return data.settings.workingDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? null : "Not a working day";
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={clsx("inline-block h-2.5 w-2.5 rounded-sm", cls)} />
      {label}
    </span>
  );
}

function DayLane({ label, type, free, children }: { label: string; type: string; free: boolean; children: ReactNode }) {
  return (
    <>
      <div className="border-b border-slate-100 px-2.5 py-2.5 font-bold text-navy">
        {label}
        <span className="block text-xs font-medium text-slate-400">
          {type}
          {free && " · Available"}
        </span>
      </div>
      <div className="relative h-[62px] border-b border-slate-100 bg-[repeating-linear-gradient(90deg,var(--color-paper-2)_0_1px,transparent_1px_calc(100%/14))]">{children}</div>
    </>
  );
}

function WeekRow({ truckId, label, type, days, data, onOpen }: { truckId: string; label: string; type: string; days: string[]; data: CapacityData; onOpen: (b: Booking) => void }) {
  return (
    <>
      <div className="border-t border-slate-100 bg-paper px-2.5 py-2 font-bold text-navy">
        {label}
        <span className="block text-xs font-medium text-slate-400">{type}</span>
      </div>
      {days.map((d) => {
        const off = data.overrides.find((o) => o.date === d && (o.closed || o.trucksUnavailable.includes(truckId)));
        const notWorking = !data.settings.workingDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay());
        const trips = data.bookings.filter((b) => b.status === "confirmed" && b.truckId === truckId && b.date === d).sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
        return (
          <div key={d} className={clsx("grid min-h-16 content-start gap-1.5 border-t border-l border-slate-100 p-1.5", (off || notWorking) && "bg-[repeating-linear-gradient(135deg,var(--color-paper)_0_6px,var(--color-paper-2)_6px_12px)]")}>
            {(off || notWorking) && <span className="text-[11px] font-semibold text-slate-400">{off ? (off.note ?? (off.closed ? "Closed" : "Truck off")) : "Not a working day"}</span>}
            {trips.map((b) => (
              <button key={b.id} type="button" onClick={() => onOpen(b)} className={clsx("grid gap-px rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11.5px] hover:brightness-95", tripStyle(b))}>
                <b className="text-navy">
                  {time12(b.arrivalTime)}–{time12(tripEnd(b))}
                </b>
                <span className="truncate">{b.customerName ?? b.notes ?? "Trip"}</span>
                <span className={hasDriver(b) ? "text-slate-500" : "font-bold text-red-600"}>{b.driverName?.trim() || "No driver"}</span>
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

/** A trip with no job (e.g. added by hand before the New job form): truck, driver, time, or cancel it. */
function TripDialog({ trip, cap, onClose, onSaved }: { trip: Booking; cap: ReturnType<typeof useCapacity>; onClose: () => void; onSaved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const cancel = async () => {
    const failed = await cap.post({ action: "cancelBooking", id: trip.id }, "Trip cancelled.");
    if (!failed) {
      onSaved();
      onClose();
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Trip" className="grid w-full max-w-lg gap-3 rounded-xl bg-paper p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">{trip.customerName ?? "Trip"}</h2>
            <p className="text-sm text-slate-600">
              {shortDay(trip.date)} · {trip.fromText ?? "?"} → {trip.toText ?? "?"}
              {trip.phone && ` · ${trip.phone}`}
            </p>
            {trip.notes && <p className="text-sm text-slate-500">{trip.notes}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-white">
            Close
          </button>
        </div>
        <TruckDriver booking={trip} cap={cap} onSaved={onSaved} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <span className="flex-1">Cancel this trip? The truck shows as free again, and the driver is told if they were already emailed.</span>
            <button type="button" disabled={cap.busy} onClick={() => void cancel()} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Cancel trip
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs font-semibold underline">
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="justify-self-start text-sm font-semibold text-red-600 hover:underline">
            Cancel trip
          </button>
        )}
      </div>
    </div>
  );
}
