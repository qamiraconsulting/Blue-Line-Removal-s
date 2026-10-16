import { useEffect, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { box, button, Field, input, num, SectionHeader, TRUCK_TYPES, useCapacity, type Driver, type Override, type Settings, type Truck } from "./capacityShared";

// "Bookings & capacity": what the chat uses to offer free arrival times and -- only when
// instant confirmation is switched on and everything below is filled in -- to confirm a
// booking on the spot. Every booking taken outside the chat (phone, Airtasker, other) must be
// added to the calendar here, or the chat can't see it. Which truck and driver goes when is
// on the Truck trips tab (TruckTrips.tsx).

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOURCES: Record<string, string> = { chat: "chat", web_form: "website form", phone: "phone", airtasker: "Airtasker", moval: "Moval", website_followup: "website follow-up", other: "other" };

const missingForInstant = (s: Settings) =>
  [
    !s.workingDays.length && "working days",
    !s.arrivalTimes.length && "arrival times",
    !s.dayEndTime && "jobs must finish by",
    s.moversPerDay === null && "movers per day",
    s.minNoticeHours === null && "minimum notice",
    s.maxDaysAhead === null && "book up to",
    s.bufferMinutes === null && "gap after each job",
  ].filter(Boolean) as string[];

export default function Capacity() {
  const { data, message, busy, setRange, load, post } = useCapacity();
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setSettings(data.settings);
  }, [data]);

  if (!data || !settings) return <p className="text-sm text-slate-500">{message?.text ?? "Loading..."}</p>;
  const missing = missingForInstant(settings);
  const truckName = (id: string | null) => data.trucks.find((t) => t.id === id)?.label ?? "unassigned";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-navy">Bookings &amp; capacity</h2>
        <p className="mt-1 text-sm text-slate-600">
          The chat uses this page to offer customers free arrival times and, only when you switch it on, to confirm bookings on the spot. Keep the calendar
          complete -- <strong>every booking must be in the calendar</strong>. Chat and website-form bookings, and jobs Matt marks Confirmed in his Google Form, go in automatically; add anything else (phone, Airtasker, Moval...) here, or the chat can&apos;t see it.
        </p>
        {message && <p className={clsx("mt-3 text-sm", message.error ? "text-red-600" : "text-green-700")}>{message.text}</p>}
      </div>

      {/* ------------------------------------------------------------ settings */}
      <section className={box}>
        <SectionHeader title="Booking settings" intro="How bookings work in general. Save after changing anything." />
        <label className="mt-4 flex items-start gap-3 rounded-md bg-slate-50 p-3">
          <input type="checkbox" className="mt-1" checked={settings.autoConfirm} onChange={(e) => setSettings({ ...settings, autoConfirm: e.target.checked })} />
          <span className="text-sm">
            <strong>Confirm bookings instantly in the chat</strong>
            <span className="block text-slate-600">
              On: the chat confirms a booking on the spot when the chosen time has a free truck of the right size and enough movers. Off: every chat booking
              is a request you confirm under Lead review.
            </span>
            {settings.autoConfirm && missing.length > 0 && (
              <span className="mt-1 block text-red-600">Nothing is confirmed instantly until these are filled in: {missing.join(", ")}.</span>
            )}
          </span>
        </label>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="text-sm">
            <span className="block text-xs font-bold uppercase text-slate-600">Working days</span>
            <span className="mb-1 block text-xs text-slate-500">Days customers can book online. Untick days you don&apos;t work.</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={settings.workingDays.includes(i)}
                    onChange={(e) =>
                      setSettings({ ...settings, workingDays: e.target.checked ? [...settings.workingDays, i].sort() : settings.workingDays.filter((x) => x !== i) })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
          <Field label="Arrival times offered" hint="Start times the chat offers customers -- 24-hour, separated by commas, e.g. 07:30, 12:00.">
            <input
              className={clsx(input, "w-full")}
              placeholder="07:30, 12:00"
              defaultValue={settings.arrivalTimes.join(", ")}
              onBlur={(e) => setSettings({ ...settings, arrivalTimes: e.target.value.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)) })}
            />
          </Field>
          <Field label="Jobs must finish by" hint="End of your working day. A time isn't offered if the job would run past it.">
            <input type="time" className={input} value={settings.dayEndTime ?? ""} onChange={(e) => setSettings({ ...settings, dayEndTime: e.target.value || null })} />
          </Field>
          {(
            [
              ["moversPerDay", "Movers available per day", "Total movers you have on a normal day, across all jobs."],
              ["bufferMinutes", "Gap after each job (minutes)", "Time kept free before the same truck can start its next job -- travel and overruns."],
              ["minNoticeHours", "Minimum notice (hours)", "How soon a job can be booked online. 48 = nothing for today or tomorrow."],
              ["maxDaysAhead", "Book up to (days ahead)", "How far into the future customers can book online, e.g. 90."],
              ["autoConfirmMaxAud", "Instant confirmation limit (AUD, optional)", "Estimates above this always go to you to confirm. Leave blank for no limit."],
            ] as const
          ).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input type="number" min={0} className={clsx(input, "w-32")} value={settings[key] ?? ""} onChange={(e) => setSettings({ ...settings, [key]: num(e.target.value) })} />
            </Field>
          ))}
        </div>
        <button type="button" disabled={busy} className={clsx(button, "mt-5")} onClick={() => void post({ action: "saveSettings", settings }, "Settings saved.")}>
          Save settings
        </button>
      </section>

      <Drivers drivers={data.drivers} trucks={data.trucks} busy={busy} onSave={(driver) => post({ action: "saveDriver", driver }, "Driver saved.")} />

      <Trucks trucks={data.trucks} drivers={data.drivers} busy={busy} onSave={(truck) => post({ action: "saveTruck", truck }, "Truck saved.")} />

      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
        Which truck and driver goes when, with the customer&apos;s details: see the{" "}
        <Link to="/admin/trips" className="font-bold text-navy underline">
          Truck trips
        </Link>{" "}
        tab.
      </p>

      <DayChanges
        overrides={data.overrides}
        trucks={data.trucks}
        today={data.today}
        busy={busy}
        onSave={(override) => post({ action: "saveOverride", override }, "Day saved.")}
        onDelete={(date) => post({ action: "deleteOverride", date }, "Day change removed.")}
      />

      {/* ------------------------------------------------------------ calendar */}
      <section className={box}>
        <SectionHeader
          title="Booking calendar"
          intro="Every confirmed job. Chat bookings appear here automatically; add everything else below. Cancelling doesn't email the customer -- let them know yourself."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="From" hint="First day to show.">
            <input type="date" className={input} defaultValue={data.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </Field>
          <Field label="To" hint="Last day to show.">
            <input type="date" className={input} defaultValue={data.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </Field>
          <button type="button" className={clsx(button, "mb-0.5")} onClick={() => void load()}>
            Show
          </button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {data.bookings.length === 0 && <li className="py-2 text-slate-500">No bookings in this range.</li>}
          {data.bookings.map((b) => (
            <li key={b.id} className={clsx("flex flex-wrap items-center justify-between gap-2 py-2", b.status === "cancelled" && "opacity-50 line-through")}>
              <span>
                <strong>
                  {b.date} {b.arrivalTime}
                </strong>{" "}
                &middot; {b.truckType} ({truckName(b.truckId)}{b.driverName ? `, driver ${b.driverName}` : ""}), {b.movers} movers, ~{Math.round((b.estimatedMinutes / 60) * 10) / 10}h &middot; {b.customerName ?? "-"}{" "}
                {b.phone && `· ${b.phone}`} &middot;{" "}
                <span className="text-slate-500">
                  via {SOURCES[b.source] ?? b.source}
                  {b.quoteReference ? ` ${b.quoteReference}` : ""}
                </span>
              </span>
              {b.status === "confirmed" && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs font-bold text-red-600 underline"
                  onClick={() => window.confirm("Cancel this booking? The customer isn't emailed -- let them know yourself.") && void post({ action: "cancelBooking", id: b.id }, "Booking cancelled.")}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <AddBooking trucks={data.trucks} busy={busy} onAdd={(booking, notifyCustomer) => post({ action: "addBooking", booking, notifyCustomer }, "Booking added.")} />
    </div>
  );
}

const blankDriver = (): Driver => ({ name: "", phone: null, email: null, active: true, notes: null });
const looksLikeEmail = (v: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function Drivers({ drivers, trucks, busy, onSave }: { drivers: Driver[]; trucks: Truck[]; busy: boolean; onSave: (d: Driver) => Promise<string | null> | void }) {
  const [draft, setDraft] = useState<Driver>(blankDriver());
  const draftOk = draft.name.trim() !== "" && looksLikeEmail(draft.email);
  return (
    <section className={box}>
      <SectionHeader
        title="Drivers"
        intro="Everyone who drives a truck. Each truck has one usual driver (set under Trucks below). When a booking on that truck is confirmed -- by the chat, by Matt, or added from a phone call -- its driver is emailed the date, time, pick-up, drop-off and the customer's name, address and phone. Without an email address a driver can't be told."
      />
      <ul className="mt-3 space-y-2">
        {drivers.map((d) => (
          <DriverRow key={d.id} driver={d} usualFor={trucks.filter((t) => t.driverId === d.id).map((t) => t.label)} busy={busy} onSave={onSave} />
        ))}
        {drivers.length === 0 && <li className="text-sm text-slate-500">No drivers yet -- add your first below.</li>}
      </ul>
      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
        <Field label="Name" hint="e.g. Sam Patel.">
          <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Mobile" hint="So the office can reach them.">
          <input type="tel" className={input} value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })} />
        </Field>
        <Field label="Email" hint="Job details are sent here.">
          <input type="email" className={clsx(input, !looksLikeEmail(draft.email) && "border-red-500")} value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value || null })} />
        </Field>
        <button
          type="button"
          disabled={busy || !draftOk}
          className={clsx(button, "mb-0.5")}
          onClick={async () => {
            const error = await onSave({ ...draft, name: draft.name.trim() });
            if (!error) setDraft(blankDriver());
          }}
        >
          Add driver
        </button>
      </div>
    </section>
  );
}

function DriverRow({ driver, usualFor, busy, onSave }: { driver: Driver; usualFor: string[]; busy: boolean; onSave: (d: Driver) => Promise<string | null> | void }) {
  const [d, setD] = useState(driver);
  useEffect(() => setD(driver), [driver]);
  const emailOk = looksLikeEmail(d.email);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Name" />
      <input type="tel" className={clsx(input, "w-36")} placeholder="mobile" value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value || null })} aria-label="Mobile" />
      <input type="email" className={clsx(input, "w-56", !emailOk && "border-red-500")} placeholder="email" value={d.email ?? ""} onChange={(e) => setD({ ...d, email: e.target.value || null })} aria-label="Email" />
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> active
      </label>
      <button type="button" disabled={busy || !d.name.trim() || !emailOk} className="text-xs font-bold text-navy underline" onClick={() => void onSave({ ...d, name: d.name.trim() })}>
        Save
      </button>
      {usualFor.length > 0 && <span className="text-xs text-slate-500">usual driver of {usualFor.join(", ")}</span>}
      {!d.email && d.active && <span className="text-xs font-bold text-amber-700">no email -- can&apos;t be told about jobs</span>}
    </li>
  );
}

function Trucks({ trucks, drivers, busy, onSave }: { trucks: Truck[]; drivers: Driver[]; busy: boolean; onSave: (t: Truck) => void }) {
  const [draft, setDraft] = useState<Truck>({ label: "", truckType: "4.5T", active: true, notes: null, driverId: null });
  return (
    <section className={box}>
      <SectionHeader
        title="Trucks"
        intro="Every truck that can be booked, with its size and its usual driver. Add each truck once. Changing a truck's usual driver moves its upcoming jobs to the new driver and emails them (the old driver is told they're off those jobs) -- use it for a permanent change. To cover one job, pick another driver on that trip in Truck trips instead."
      />
      <ul className="mt-3 space-y-2">
        {trucks.map((t) => (
          <TruckRow key={t.id} truck={t} drivers={drivers} busy={busy} onSave={onSave} />
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
        <Field label="Name / rego" hint="A name the team recognises, e.g. Truck 2 (ABC123).">
          <input className={input} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </Field>
        <Field label="Size" hint="The size its estimates are based on.">
          <select className={input} value={draft.truckType} onChange={(e) => setDraft({ ...draft, truckType: e.target.value })}>
            {TRUCK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Usual driver" hint="Gets the job emails for this truck.">
          <DriverSelect drivers={drivers} value={draft.driverId} onChange={(driverId) => setDraft({ ...draft, driverId })} none="no driver yet" />
        </Field>
        <button
          type="button"
          disabled={busy || !draft.label.trim()}
          className={clsx(button, "mb-0.5")}
          onClick={() => {
            onSave(draft);
            setDraft({ label: "", truckType: "4.5T", active: true, notes: null, driverId: null });
          }}
        >
          Add truck
        </button>
      </div>
      {trucks.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          <strong>Active</strong>: untick a truck that&apos;s off the road long term. For a single day (e.g. a service), use Days off &amp; changes instead.
        </p>
      )}
    </section>
  );
}

/** Active drivers, plus the one already chosen even if they have since been made inactive. */
function DriverSelect({ drivers, value, onChange, none }: { drivers: Driver[]; value: string | null; onChange: (id: string | null) => void; none: string }) {
  return (
    <select className={input} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Usual driver">
      <option value="">{none}</option>
      {drivers
        .filter((d) => d.active || d.id === value)
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.email ? "" : " (no email)"}
          </option>
        ))}
    </select>
  );
}

function TruckRow({ truck, drivers, busy, onSave }: { truck: Truck; drivers: Driver[]; busy: boolean; onSave: (t: Truck) => void }) {
  const [t, setT] = useState(truck);
  useEffect(() => setT(truck), [truck]);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <input className={input} value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} aria-label="Name / rego" />
      <select className={input} value={t.truckType} onChange={(e) => setT({ ...t, truckType: e.target.value })} aria-label="Size">
        {TRUCK_TYPES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <DriverSelect drivers={drivers} value={t.driverId} onChange={(driverId) => setT({ ...t, driverId })} none="no driver yet" />
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} /> active
      </label>
      <button type="button" disabled={busy} className="text-xs font-bold text-navy underline" onClick={() => onSave(t)}>
        Save
      </button>
    </li>
  );
}

function DayChanges(props: {
  overrides: Override[];
  trucks: Truck[];
  today: string;
  busy: boolean;
  onSave: (o: Override) => void;
  onDelete: (date: string) => void;
}) {
  const blank: Override = { date: "", closed: false, moversAvailable: null, trucksUnavailable: [], note: null };
  const [draft, setDraft] = useState<Override>(blank);
  const name = (id: string) => props.trucks.find((t) => t.id === id)?.label ?? id;
  const nothingChosen = !draft.closed && draft.moversAvailable === null && draft.trucksUnavailable.length === 0;
  return (
    <section className={box}>
      <SectionHeader
        title="Days off & changes"
        intro="Use this when one particular day is different from normal -- closed, a truck off, or fewer movers. Every other day uses the Booking settings above."
      />
      <ul className="mt-3 space-y-1 text-sm">
        {props.overrides.length === 0 && <li className="text-slate-500">No changes coming up.</li>}
        {props.overrides.map((o) => (
          <li key={o.date} className="flex flex-wrap items-center gap-2">
            <strong>{o.date}</strong>
            {o.closed
              ? "closed"
              : [o.moversAvailable !== null && `${o.moversAvailable} movers`, o.trucksUnavailable.length > 0 && `off: ${o.trucksUnavailable.map(name).join(", ")}`]
                  .filter(Boolean)
                  .join(" · ")}
            {o.note && <span className="text-slate-500">({o.note})</span>}
            <button type="button" disabled={props.busy} className="text-xs font-bold text-red-600 underline" onClick={() => props.onDelete(o.date)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <Field label="Date" hint="The day that's different.">
          <input type="date" min={props.today} className={input} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </Field>
        <div className="text-sm">
          <span className="block text-xs font-bold uppercase text-slate-600">Closed all day</span>
          <span className="mb-1 block text-xs text-slate-500">Tick for no online bookings at all that day (holiday, staff event).</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={draft.closed} onChange={(e) => setDraft({ ...draft, closed: e.target.checked })} /> closed
          </label>
        </div>
        {!draft.closed && (
          <>
            <Field label="Movers that day" hint="Only if different from usual (e.g. someone on leave). Leave blank = usual number.">
              <input
                type="number"
                min={0}
                className={clsx(input, "w-24")}
                value={draft.moversAvailable ?? ""}
                onChange={(e) => setDraft({ ...draft, moversAvailable: num(e.target.value) })}
              />
            </Field>
            <div className="text-sm">
              <span className="block text-xs font-bold uppercase text-slate-600">Trucks off that day</span>
              <span className="mb-1 block text-xs text-slate-500">Tick any truck that can&apos;t be used that day (service, repair).</span>
              {props.trucks.length === 0 ? (
                <span className="text-xs text-slate-500">Add your trucks first (Trucks section above).</span>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {props.trucks.map((t) => (
                    <label key={t.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.trucksUnavailable.includes(t.id!)}
                        onChange={(e) =>
                          setDraft({ ...draft, trucksUnavailable: e.target.checked ? [...draft.trucksUnavailable, t.id!] : draft.trucksUnavailable.filter((x) => x !== t.id) })
                        }
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <Field label="Note (optional)" hint="A reminder for the team, e.g. Truck 1 at the mechanic." className="sm:col-span-2">
          <input className={clsx(input, "w-full")} value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value || null })} />
        </Field>
      </div>
      <button
        type="button"
        disabled={props.busy || !draft.date || nothingChosen}
        className={clsx(button, "mt-4")}
        onClick={() => {
          props.onSave(draft);
          setDraft(blank);
        }}
      >
        Save day
      </button>
    </section>
  );
}

function AddBooking({ trucks, busy, onAdd }: { trucks: Truck[]; busy: boolean; onAdd: (b: Record<string, unknown>, notifyCustomer: boolean) => void }) {
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
        <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} /> Email the customer a booking confirmation (when an email is entered)
      </label>
      <p className="mt-2 text-xs text-slate-500">
        Date, arrival time, estimated hours and movers are required. The truck&apos;s driver is emailed the job automatically once a truck is assigned (pick a specific truck above, or the system picks a free one).
      </p>
    </section>
  );
}

