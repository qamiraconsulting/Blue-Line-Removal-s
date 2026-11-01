import { useEffect, useState } from "react";
import clsx from "clsx";
import { fromMinutes, time12, toMinutes, tripEnd } from "../../lib/truckTrips";
import type { Booking, useCapacity } from "../admin/capacityShared";
import { Panel } from "./shared";

// A booking's truck, driver and time -- on the job page, and on the Schedule for a trip with no job.

/** The booking's truck, driver and time -- the same save as Booking and trucks (the server refuses clashes). */
export function TruckDriver({ booking, cap, onSaved }: { booking: Booking | null; cap: ReturnType<typeof useCapacity>; onSaved?: () => void }) {
  const [f, setF] = useState({ truckId: "", driverId: "", date: "", start: "" });
  useEffect(() => {
    if (booking) setF({ truckId: booking.truckId ?? "", driverId: booking.driverId ?? "", date: booking.date, start: booking.arrivalTime });
  }, [booking]);
  if (!cap.data) return null;
  if (!booking)
    return (
      <Panel title="Truck & driver">
        <p className="px-4 pb-4 text-sm text-slate-500">This booking isn't in the calendar yet.</p>
      </Panel>
    );
  const dirty = f.truckId !== (booking.truckId ?? "") || f.driverId !== (booking.driverId ?? "") || f.date !== booking.date || f.start !== booking.arrivalTime;
  const save = async () => {
    const failed = await cap.post(
      {
        action: "saveTrip",
        notifyCustomer: booking.customerNoticeWanted && Boolean(booking.customerEmail),
        trip: {
          id: booking.id,
          truckId: f.truckId,
          date: f.date,
          start: f.start,
          end: fromMinutes(toMinutes(f.start) + booking.estimatedMinutes),
          movers: booking.movers,
          driverId: f.driverId || null,
          customerName: booking.customerName,
          phone: booking.phone,
          customerEmail: booking.customerEmail,
          fromText: booking.fromText,
          toText: booking.toText,
          notes: booking.notes,
        },
      },
      "Saved. The driver and customer get the updated details.",
    );
    if (!failed) onSaved?.();
  };
  const sel = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <Panel title="Truck & driver" aside={<span className="text-xs text-slate-500">{time12(booking.arrivalTime)} – {time12(tripEnd(booking))}</span>}>
      <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 text-xs font-semibold text-slate-500">
        <label className="grid gap-1">
          Truck
          <select className={sel} value={f.truckId} onChange={(e) => setF({ ...f, truckId: e.target.value })}>
            {cap.data.trucks.filter((t) => t.id && (t.active || t.id === booking.truckId)).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.truckType}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Driver
          <select className={sel} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
            <option value="">No driver yet</option>
            {cap.data.drivers.filter((d) => d.id && (d.active || d.id === booking.driverId)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Date
          <input type="date" className={sel} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        <label className="grid gap-1">
          Arrive
          <input type="time" className={sel} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </label>
        {cap.message && <p className={clsx("col-span-2 text-sm font-normal", cap.message.error ? "text-red-600" : "text-green-700")}>{cap.message.text}</p>}
        {!booking.driverName?.trim() && !dirty && <p className="col-span-2 text-sm font-bold text-red-600">No driver picked yet.</p>}
        <div className="col-span-2">
          <button type="button" disabled={!dirty || cap.busy} onClick={() => void save()} className="rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
            Save changes
          </button>
        </div>
      </div>
    </Panel>
  );
}
