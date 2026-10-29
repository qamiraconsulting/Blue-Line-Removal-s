import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { shortDay } from "../../lib/noticeTiming";
import { time12, tripEnd } from "../../lib/truckTrips";
import { useCapacity, type Booking } from "../admin/capacityShared";
import { TripsDayPanel } from "../admin/TruckTrips";
import { addDays, melbourneToday } from "./shared";

// Schedule: which truck goes out when, and who drives it. The chat reads this same calendar, so
// it only offers customers times when a truck is free. Week view (new) to see the week at a
// glance; Day view is the day editor from Booking and trucks (add, move or cancel a trip,
// pick drivers, jobs with no driver yet). Replaces the Booking and trucks tab.

function mondayOf(iso: string) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

export default function Schedule() {
  const navigate = useNavigate();
  const today = useMemo(melbourneToday, []);
  const cap = useCapacity();
  const [mode, setMode] = useState<"week" | "day">("week");
  const [week, setWeek] = useState(() => mondayOf(today));
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)), [week]);

  useEffect(() => {
    cap.changeRange({ from: days[0], to: days[6] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const data = cap.data;
  const openTrip = (b: Booking) => {
    if (b.quoteReference) return navigate(`/admin/new/jobs/${b.quoteReference}`);
    cap.changeRange({ tripDay: b.date });
    setMode("day");
  };
  const shift = (n: number) => {
    if (mode === "week") setWeek(n === 0 ? mondayOf(today) : addDays(week, 7 * n));
    else cap.changeRange({ tripDay: n === 0 ? today : addDays(data?.tripDay ?? today, n) });
  };
  const btn = "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold hover:border-navy";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-black text-navy">Schedule</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-slate-600">
            Which truck goes out when, and who drives it. The chat reads this same calendar, so it only offers customers times when a truck is free. Driver and customer emails go out at 9:00 am the day before each move.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="View">
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
      {!data && <p className="text-sm text-slate-500">Loading...</p>}

      {data && mode === "week" && (
        <>
          <div className="flex flex-wrap gap-3.5 text-xs text-slate-600">
            <Key cls="bg-eco" label="Booked, driver set" />
            <Key cls="bg-red-500" label="No driver yet" />
            <Key cls="bg-slate-300" label="Day off / not working" />
          </div>
          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
              <h2 className="font-display text-lg font-extrabold text-navy">
                {shortDay(days[0])} – {shortDay(days[6])}
              </h2>
              <span className="text-sm text-slate-500 tabular-nums">{data.bookings.filter((b) => b.status === "confirmed").length} trips</span>
            </div>
            <div className="grid min-w-[960px] grid-cols-[128px_repeat(7,minmax(118px,1fr))] border-t border-slate-100 text-sm">
              <div className="bg-paper" />
              {days.map((d) => (
                <button key={d} type="button" onClick={() => {
                  cap.changeRange({ tripDay: d });
                  setMode("day");
                }} className={clsx("border-l border-slate-100 bg-paper px-2 py-2 text-left text-xs font-bold", d === today ? "text-action-dim shadow-[inset_0_-2px_0_var(--color-action)]" : "text-slate-600")}>
                  {shortDay(d).split(" ")[0]}
                  <span className="block font-medium text-slate-400">{shortDay(d).split(" ").slice(1).join(" ")}</span>
                </button>
              ))}
              {data.trucks.filter((t) => t.active && t.id).map((t) => (
                <Row key={t.id} truckId={t.id!} label={t.label} type={t.truckType} days={days} data={data} onOpen={openTrip} />
              ))}
            </div>
          </section>
          <p className="text-xs text-slate-500">Click a day to edit its trips, add one, or pick drivers. Click a trip to open its job.</p>
        </>
      )}

      {data && mode === "day" && <TripsDayPanel cap={cap} />}

      {data && (
        <div>
          <button type="button" disabled={cap.busy} className="text-xs font-bold text-navy underline" onClick={() => void cap.post({ action: "sendDueNotices" }, "Checked for emails that are due.")}>
            Send due emails now
          </button>
          <span className="ml-2 text-xs text-slate-500">(the live site does this every hour; use this on the test link)</span>
        </div>
      )}
    </div>
  );
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={clsx("inline-block h-2.5 w-2.5 rounded-sm", cls)} />
      {label}
    </span>
  );
}

function Row({ truckId, label, type, days, data, onOpen }: { truckId: string; label: string; type: string; days: string[]; data: NonNullable<ReturnType<typeof useCapacity>["data"]>; onOpen: (b: Booking) => void }) {
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
              <button
                key={b.id}
                type="button"
                onClick={() => onOpen(b)}
                className={clsx("grid gap-px rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11.5px] hover:brightness-95", b.driverName?.trim() ? "border-eco bg-eco-wash" : "border-red-500 bg-red-50")}
              >
                <b className="text-navy">
                  {time12(b.arrivalTime)}–{time12(tripEnd(b))}
                </b>
                <span className="truncate">{b.customerName ?? b.notes ?? "Trip"}</span>
                <span className={b.driverName?.trim() ? "text-slate-500" : "font-bold text-red-600"}>{b.driverName?.trim() || "No driver"}</span>
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}
