import { useState } from "react";
import clsx from "clsx";
import { box, button, Field, input, looksLikeEmail, SectionHeader, TRUCK_TYPES, type Truck } from "./capacityShared";

// "Add a booking by hand" -- a job booked any other way (phone, Airtasker, Moval...) that didn't
// go through the chat, the website form or Matt's Google Form. It lives on the Booking and
// trucks tab, next to the trips, so the chat knows that truck and those movers are busy.

export default function AddBooking({ trucks, busy, onAdd }: { trucks: Truck[]; busy: boolean; onAdd: (b: Record<string, unknown>, notifyCustomer: boolean) => void }) {
  const blank = { source: "phone", date: "", arrivalTime: "", hours: "", truckType: "4.5T", truckId: "", movers: "2", customerName: "", phone: "", customerEmail: "", fromText: "", toText: "", notes: "" };
  const [f, setF] = useState(blank);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const emailOk = looksLikeEmail(f.customerEmail);
  const ready = f.date && /^\d{2}:\d{2}$/.test(f.arrivalTime) && Number(f.hours) > 0 && Number(f.movers) > 0 && emailOk;
  return (
    <section className={box}>
      <SectionHeader
        title="Add a booking by hand"
        intro="For jobs booked any other way (phone, Airtasker, Moval...) that did NOT go through Matt's Google Form, so the chat knows that truck and those movers are busy. Chat, website-form and Google Form bookings are added automatically -- don't add those."
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Booked via" hint="Where the booking came from.">
          <select className={input} value={f.source} onChange={set("source")}>
            <option value="phone">Phone</option>
            <option value="airtasker">Airtasker</option>
            <option value="moval">Moval</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date" hint="Day of the job.">
          <input type="date" className={input} value={f.date} onChange={set("date")} />
        </Field>
        <Field label="Arrival time" hint="When the crew arrives at the pickup.">
          <input type="time" className={input} value={f.arrivalTime} onChange={set("arrivalTime")} />
        </Field>
        <Field label="Estimated hours" hint="How long the job should take, start to finish.">
          <input type="number" min={0.5} step={0.5} className={clsx(input, "w-24")} value={f.hours} onChange={set("hours")} />
        </Field>
        <Field label="Truck size" hint="The size the job needs.">
          <select className={input} value={f.truckType} onChange={set("truckType")}>
            {TRUCK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Truck" hint="A specific truck, or let the system pick a free one.">
          <select className={input} value={f.truckId} onChange={set("truckId")}>
            <option value="">any free truck</option>
            {trucks
              .filter((t) => t.active && t.truckType === f.truckType)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Movers" hint="Crew size on the job.">
          <input type="number" min={1} className={clsx(input, "w-20")} value={f.movers} onChange={set("movers")} />
        </Field>
        <Field label="Customer" hint="Customer's name (optional).">
          <input className={input} value={f.customerName} onChange={set("customerName")} />
        </Field>
        <Field label="Phone" hint="Customer's phone (optional).">
          <input className={input} value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Customer email" hint="To email them a booking confirmation (optional).">
          <input type="email" className={clsx(input, !emailOk && "border-red-500")} value={f.customerEmail} onChange={set("customerEmail")} />
        </Field>
        <Field label="From" hint="Pickup suburb or address (optional).">
          <input className={input} value={f.fromText} onChange={set("fromText")} />
        </Field>
        <Field label="To" hint="Drop-off suburb or address (optional).">
          <input className={input} value={f.toText} onChange={set("toText")} />
        </Field>
        <Field label="Notes" hint="Anything useful, e.g. Airtasker job number (optional).">
          <input className={input} value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
      <button
        type="button"
        disabled={busy || !ready}
        className={clsx(button, "mt-4")}
        onClick={() => {
          onAdd({
            source: f.source,
            date: f.date,
            arrivalTime: f.arrivalTime,
            estimatedMinutes: Math.round(Number(f.hours) * 60),
            truckType: f.truckType,
            truckId: f.truckId || null,
            movers: Number(f.movers),
            customerName: f.customerName || null,
            phone: f.phone || null,
            customerEmail: f.customerEmail.trim() || null,
            fromText: f.fromText || null,
            toText: f.toText || null,
            notes: f.notes || null,
          }, notifyCustomer && Boolean(f.customerEmail.trim()));
          setF(blank);
        }}
      >
        Add booking
      </button>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} /> Email the customer their booking details the day before the move (needs their email)
      </label>
      <p className="mt-2 text-xs text-slate-500">
        Date, arrival time, estimated hours and movers are required. The truck&apos;s driver is emailed the job automatically the day before the move once a truck is assigned (pick a specific truck above, or the system picks a free one).
      </p>
    </section>
  );
}
