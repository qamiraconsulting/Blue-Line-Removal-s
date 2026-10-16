import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { describeProblem, statusAt, time12, toMinutes, tripEnd, tripProblem, truckDay } from "../../lib/truckTrips";
import { useAdminApi } from "./useAdminApi";

// "Bookings & capacity": what the chat uses to offer free arrival times and -- only when
// instant confirmation is switched on and everything below is filled in -- to confirm a
// booking on the spot. Every booking taken outside the chat (phone, Airtasker, other) must be
// added to the calendar here, or the chat can't see it.

const TRUCK_TYPES = ["4.5T", "6-8T", "10T"] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOURCES: Record<string, string> = { chat: "chat", web_form: "website form", phone: "phone", airtasker: "Airtasker", moval: "Moval", website_followup: "website follow-up", other: "other" };

interface Settings {
  autoConfirm: boolean;
  workingDays: number[];
  arrivalTimes: string[];
  dayEndTime: string | null;
  bufferMinutes: number | null;
  moversPerDay: number | null;
  minNoticeHours: number | null;
  maxDaysAhead: number | null;
  autoConfirmMaxAud: number | null;
}
interface Truck {
  id?: string;
  label: string;
  truckType: string;
  active: boolean;
  notes: string | null;
}
interface Override {
  date: string;
  closed: boolean;
  moversAvailable: number | null;
  trucksUnavailable: string[];
  note: string | null;
}
interface Booking {
  id: string;
  source: string;
  status: string;
  quoteReference: string | null;
  date: string;
  arrivalTime: string;
  estimatedMinutes: number;
  truckType: string;
  truckId: string | null;
  movers: number;
  customerName: string | null;
  phone: string | null;
  fromText: string | null;
  toText: string | null;
  notes: string | null;
}
interface Data {
  today: string;
  nowTime: string;
  tripDay: string;
  dayTrips: Booking[];
  from: string;
  to: string;
  settings: Settings;
  trucks: Truck[];
  overrides: Override[];
  bookings: Booking[];
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
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

const box = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const input = "rounded border border-slate-300 px-2 py-1 text-sm focus:border-action focus:outline-none";
const button = "rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40";

/** A labelled field with a one-line explanation underneath the label. */
function Field({ label, hint, children, className }: { label: string; hint: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block text-sm", className)}>
      <span className="block text-xs font-bold uppercase text-slate-600">{label}</span>
      <span className="mb-1 block text-xs text-slate-500">{hint}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <>
      <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{intro}</p>
    </>
  );
}

export default function Capacity() {
  const { adminFetch } = useAdminApi();
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [range, setRange] = useState<{ from?: string; to?: string; tripDay?: string }>({});
  const [busy, setBusy] = useState(false);

  async function load(r = range) {
    const qs = new URLSearchParams(Object.entries(r).filter(([, v]) => v) as [string, string][]).toString();
    const res = await adminFetch(`/api/admin/capacity${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      setMessage({ text: (await res.json()).error ?? "Couldn't load", error: true });
      return;
    }
    const d = (await res.json()) as Data;
    setData(d);
    setSettings(d.settings);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), []);

  /** Returns the error shown, or null when it saved. */
  async function post(body: unknown, done: string): Promise<string | null> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/capacity", { method: "POST", body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't save");
      setMessage({ text: out.capacityWarning ? `${done} -- note: the calendar didn't show room (${out.capacityWarning.replace(/_/g, " ")}).` : done });
      await load();
      return null;
    } catch (err) {
      const text = err instanceof Error ? err.message : "Couldn't save";
      setMessage({ text, error: true });
      return text;
    } finally {
      setBusy(false);
    }
  }

  function showTripDay(tripDay: string) {
    const next = { ...range, tripDay };
    setRange(next);
    void load(next);
  }

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

      <Trucks trucks={data.trucks} busy={busy} onSave={(truck) => post({ action: "saveTruck", truck }, "Truck saved.")} />

      <TruckTrips
        data={data}
        busy={busy}
        onDay={showTripDay}
        onSave={(trip) => post({ action: "saveTrip", trip }, trip.id ? "Trip updated." : "Trip added.")}
        onCancel={(b) =>
          window.confirm(
            b.quoteReference
              ? `This trip is the booking for ${b.customerName ?? b.quoteReference}. Cancelling it cancels their booking too (the customer isn't emailed -- let them know yourself). To only change the truck or times, use Edit instead.`
              : "Cancel this trip? The truck shows as Available again.",
          )
            ? post({ action: "cancelBooking", id: b.id }, b.quoteReference ? "Booking cancelled." : "Trip cancelled.")
            : Promise.resolve(null)
        }
      />

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
                &middot; {b.truckType} ({truckName(b.truckId)}), {b.movers} movers, ~{Math.round((b.estimatedMinutes / 60) * 10) / 10}h &middot; {b.customerName ?? "-"}{" "}
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

      <AddBooking trucks={data.trucks} busy={busy} onAdd={(booking) => post({ action: "addBooking", booking }, "Booking added.")} />
    </div>
  );
}

function Trucks({ trucks, busy, onSave }: { trucks: Truck[]; busy: boolean; onSave: (t: Truck) => void }) {
  const [draft, setDraft] = useState<Truck>({ label: "", truckType: "4.5T", active: true, notes: null });
  return (
    <section className={box}>
      <SectionHeader title="Trucks" intro="Every truck that can be booked, with its size. Add each truck once." />
      <ul className="mt-3 space-y-2">
        {trucks.map((t) => (
          <TruckRow key={t.id} truck={t} busy={busy} onSave={onSave} />
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
        <button
          type="button"
          disabled={busy || !draft.label.trim()}
          className={clsx(button, "mb-0.5")}
          onClick={() => {
            onSave(draft);
            setDraft({ label: "", truckType: "4.5T", active: true, notes: null });
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

function TruckRow({ truck, busy, onSave }: { truck: Truck; busy: boolean; onSave: (t: Truck) => void }) {
  const [t, setT] = useState(truck);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <input className={input} value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} aria-label="Name / rego" />
      <select className={input} value={t.truckType} onChange={(e) => setT({ ...t, truckType: e.target.value })} aria-label="Size">
        {TRUCK_TYPES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
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

function AddBooking({ trucks, busy, onAdd }: { trucks: Truck[]; busy: boolean; onAdd: (b: Record<string, unknown>) => void }) {
  const blank = { source: "phone", date: "", arrivalTime: "", hours: "", truckType: "4.5T", truckId: "", movers: "2", customerName: "", phone: "", fromText: "", toText: "", notes: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const ready = f.date && /^\d{2}:\d{2}$/.test(f.arrivalTime) && Number(f.hours) > 0 && Number(f.movers) > 0;
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
            fromText: f.fromText || null,
            toText: f.toText || null,
            notes: f.notes || null,
          });
          setF(blank);
        }}
      >
        Add booking
      </button>
      <p className="mt-2 text-xs text-slate-500">Date, arrival time, estimated hours and movers are required.</p>
    </section>
  );
}

const DAY_START = "06:00";
const DAY_END = "20:00";
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

interface TripForm {
  id?: string;
  truckId: string;
  date: string;
  start: string;
  end: string;
  movers: string;
  customerName: string;
  notes: string;
}

function TruckTrips(props: {
  data: Data;
  busy: boolean;
  onDay: (date: string) => void;
  onSave: (trip: Record<string, unknown> & { id?: string }) => Promise<string | null>;
  onCancel: (b: Booking) => Promise<string | null>;
}) {
  const { data } = props;
  const day = data.tripDay;
  const blank = (date = day): TripForm => ({ truckId: "", date, start: "", end: "", movers: "2", customerName: "", notes: "" });
  const [f, setF] = useState<TripForm>(blank());
  const [serverError, setServerError] = useState<string | null>(null);
  // A new trip goes on the day being shown.
  useEffect(() => setF((x) => (x.id ? x : { ...x, date: day })), [day]);
  const activeTrucks = data.trucks.filter((t) => t.active);
  const name = (id: string | null) => data.trucks.find((t) => t.id === id)?.label ?? "That truck";
  const off = data.overrides.find((o) => o.date === day)?.trucksUnavailable ?? [];
  const isToday = day === data.today;
  const needTruck = data.dayTrips.filter((b) => b.status === "confirmed" && !b.truckId);

  // Live check while typing (the server checks again inside the booking lock).
  const timesTyped = /^\d{2}:\d{2}$/.test(f.start) && /^\d{2}:\d{2}$/.test(f.end);
  const problem =
    f.truckId && timesTyped && f.date === day ? tripProblem({ id: f.id, truckId: f.truckId, date: f.date, start: f.start, end: f.end }, data.dayTrips, off) : null;
  const ready = Boolean(f.truckId && f.date && timesTyped && Number(f.movers) > 0 && !problem);

  const set = (k: keyof TripForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setServerError(null);
    setF({ ...f, [k]: e.target.value });
    if (k === "date" && e.target.value && e.target.value !== day) props.onDay(e.target.value);
  };

  const edit = (b: Booking) => {
    setServerError(null);
    setF({
      id: b.id,
      truckId: b.truckId ?? "",
      date: b.date,
      start: b.arrivalTime,
      end: tripEnd(b),
      movers: String(b.movers),
      customerName: b.customerName ?? "",
      notes: b.notes ?? "",
    });
  };

  async function save() {
    const error = await props.onSave({
      ...(f.id ? { id: f.id } : {}),
      truckId: f.truckId,
      date: f.date,
      start: f.start,
      end: f.end,
      movers: Number(f.movers),
      customerName: f.customerName.trim() || null,
      notes: f.notes.trim() || null,
    });
    setServerError(error);
    if (!error) setF(blank(f.date));
  }

  const span = toMinutes(DAY_END) - toMinutes(DAY_START);
  const at = (hhmm: string) => Math.min(100, Math.max(0, ((toMinutes(hhmm) - toMinutes(DAY_START)) / span) * 100));

  return (
    <section className={box}>
      <SectionHeader
        title="Truck trips"
        intro={
          <>
            Which truck is out when. Assign a truck to a trip and it shows as <strong>Assigned / Engaged</strong> for that time and <strong>Available</strong> the
            rest of the day. The chat reads the same trips, so it only offers customers times when a truck is free.
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Day" hint="The day to show.">
          <input type="date" className={input} value={day} onChange={(e) => e.target.value && props.onDay(e.target.value)} />
        </Field>
        <button type="button" className="mb-1 text-xs font-bold text-navy underline" onClick={() => props.onDay(data.today)}>
          Today
        </button>
        <span className="mb-1 text-sm text-slate-600">
          {shortDate(day)}
          {isToday && ` · now ${time12(data.nowTime)}`}
        </span>
      </div>

      {activeTrucks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Add your trucks first (Trucks section above), e.g. &quot;Baby Blue&quot;.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="relative hidden h-4 text-[10px] text-slate-400 sm:ml-40 sm:block">
            {["06:00", "09:00", "12:00", "15:00", "18:00"].map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${at(t)}%` }}>
                {time12(t).replace(":00", "")}
              </span>
            ))}
          </div>
          {activeTrucks.map((t) => {
            const segments = truckDay(t.id!, data.dayTrips, day, DAY_START, DAY_END);
            const isOff = off.includes(t.id!);
            const now = isToday && !isOff ? statusAt(segments, data.nowTime) : null;
            return (
              <div key={t.id} className="text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <div className="sm:w-40 sm:shrink-0">
                    <strong>{t.label}</strong> <span className="text-xs text-slate-500">{t.truckType}</span>
                    {isOff && <span className="block text-xs font-bold text-red-600">Off this day</span>}
                    {now && <span className={clsx("block text-xs font-bold", now === "Available" ? "text-green-700" : "text-orange-700")}>Now: {now}</span>}
                  </div>
                  <div className={clsx("relative h-7 w-full overflow-hidden rounded", isOff ? "bg-slate-200" : "bg-green-100")} aria-hidden>
                    {segments
                      .filter((s) => s.engaged)
                      .map((s) => (
                        <div
                          key={s.trip!.id}
                          className="absolute inset-y-0 overflow-hidden whitespace-nowrap border-x border-white bg-orange-500 px-1 text-[11px] leading-7 text-white"
                          style={{ left: `${at(s.start)}%`, width: `${Math.max(at(s.end) - at(s.start), 0.5)}%` }}
                          title={`${time12(s.start)} - ${time12(s.end)}`}
                        >
                          {time12(s.start)}
                        </div>
                      ))}
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5 sm:ml-40">
                  {isOff ? (
                    <li className="text-xs text-slate-500">Marked off in Days off &amp; changes -- not offered to customers.</li>
                  ) : (
                    segments.map((s) =>
                      s.engaged ? (
                        <li key={s.trip!.id} className="flex flex-wrap items-center gap-x-2">
                          <span className="font-bold text-orange-700">Assigned / Engaged</span>
                          <span>
                            {time12(s.start)} - {time12(s.end)}
                          </span>
                          <span className="text-slate-600">{[s.trip!.customerName, s.trip!.quoteReference, s.trip!.notes].filter(Boolean).join(" · ") || "trip"}</span>
                          <button type="button" disabled={props.busy} className="text-xs font-bold text-navy underline" onClick={() => edit(s.trip as Booking)}>
                            Edit
                          </button>
                          <button type="button" disabled={props.busy} className="text-xs font-bold text-red-600 underline" onClick={() => void props.onCancel(s.trip as Booking)}>
                            Cancel
                          </button>
                        </li>
                      ) : (
                        <li key={s.start} className="text-xs text-green-700">
                          Available {time12(s.start)} - {time12(s.end)}
                        </li>
                      ),
                    )
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {needTruck.length > 0 && (
        <div className="mt-5 rounded-md bg-amber-50 p-3 text-sm">
          <strong>Booked jobs with no truck assigned yet</strong>
          <span className="block text-xs text-slate-600">They still hold a truck of their size for the chat. Assign one so everyone knows which truck goes.</span>
          <ul className="mt-2 space-y-1">
            {needTruck.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-2">
                <span>
                  {time12(b.arrivalTime)} - {time12(tripEnd(b))} · needs {b.truckType} · {b.customerName ?? b.quoteReference ?? "job"}
                </span>
                <button type="button" disabled={props.busy} className="text-xs font-bold text-navy underline" onClick={() => edit(b)}>
                  Assign a truck
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-bold text-navy">{f.id ? "Edit trip" : "Assign a truck to a trip"}</h4>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Truck" hint="The truck going out.">
            <select className={input} value={f.truckId} onChange={set("truckId")}>
              <option value="">choose a truck</option>
              {activeTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.truckType})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" hint="Day of the trip.">
            <input type="date" className={input} value={f.date} onChange={set("date")} />
          </Field>
          <Field label="Movers" hint="Crew on this trip.">
            <input type="number" min={1} className={clsx(input, "w-20")} value={f.movers} onChange={set("movers")} />
          </Field>
          <Field label="Start time" hint="When the truck heads out, e.g. 8:00 AM.">
            <input type="time" className={input} value={f.start} onChange={set("start")} />
          </Field>
          <Field label="End time" hint="When it's free again, e.g. 11:00 AM.">
            <input type="time" className={input} value={f.end} onChange={set("end")} />
          </Field>
          <Field label="Customer (optional)" hint="Who the trip is for.">
            <input className={input} value={f.customerName} onChange={set("customerName")} />
          </Field>
          <Field label="Notes (optional)" hint="e.g. Airtasker job, depot run." className="sm:col-span-3">
            <input className={clsx(input, "w-full")} value={f.notes} onChange={set("notes")} />
          </Field>
        </div>
        {(problem || serverError) && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm font-bold text-red-700">
            {problem ? describeProblem(problem, name(f.truckId)) : serverError}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" disabled={props.busy || !ready} className={button} onClick={() => void save()}>
            {f.id ? "Save changes" : "Assign truck"}
          </button>
          {(f.id || f.truckId || f.start || f.end) && (
            <button
              type="button"
              className="text-xs font-bold text-slate-600 underline"
              onClick={() => {
                setServerError(null);
                setF(blank());
              }}
            >
              {f.id ? "Stop editing" : "Clear"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
