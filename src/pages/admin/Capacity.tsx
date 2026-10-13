import { useEffect, useState } from "react";
import clsx from "clsx";
import { useAdminApi } from "./useAdminApi";

// "Bookings & capacity": what the chat uses to offer free arrival times and -- only when
// instant confirmation is switched on and everything below is filled in -- to confirm a
// booking on the spot. Phone bookings must be added to the calendar here, or the chat can't
// see them.

const TRUCK_TYPES = ["4.5T", "6-8T", "10T"] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    !s.dayEndTime && "end of day",
    s.moversPerDay === null && "movers per day",
    s.minNoticeHours === null && "minimum notice",
    s.maxDaysAhead === null && "how far ahead",
    s.bufferMinutes === null && "gap between jobs",
  ].filter(Boolean) as string[];

const box = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const input = "rounded border border-slate-300 px-2 py-1 text-sm focus:border-action focus:outline-none";
const button = "rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40";

export default function Capacity() {
  const { adminFetch } = useAdminApi();
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
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

  async function post(body: unknown, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/capacity", { method: "POST", body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't save");
      setMessage({ text: out.capacityWarning ? `${done} -- note: the calendar didn't show room (${out.capacityWarning.replace(/_/g, " ")}).` : done });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't save", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!data || !settings) return <p className="text-sm text-slate-500">{message?.text ?? "Loading..."}</p>;
  const missing = missingForInstant(settings);
  const truckName = (id: string | null) => data.trucks.find((t) => t.id === id)?.label ?? "unassigned";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-navy">Bookings &amp; capacity</h2>
        <p className="mt-1 text-sm text-slate-600">
          The chat uses this page to offer free arrival times and, only when you switch it on, to confirm bookings on the spot. Keep the calendar complete --
          <strong> add phone bookings here</strong>, or the chat can&apos;t see them.
        </p>
        {message && <p className={clsx("mt-3 text-sm", message.error ? "text-red-600" : "text-green-700")}>{message.text}</p>}
      </div>

      {/* ------------------------------------------------------------ settings */}
      <section className={box}>
        <h3 className="font-display text-lg font-bold text-navy">Booking settings</h3>
        <label className="mt-4 flex items-start gap-3 rounded-md bg-slate-50 p-3">
          <input type="checkbox" className="mt-1" checked={settings.autoConfirm} onChange={(e) => setSettings({ ...settings, autoConfirm: e.target.checked })} />
          <span className="text-sm">
            <strong>Confirm bookings instantly in the chat</strong> when the chosen time has a free truck and enough movers.
            <br />
            <span className="text-slate-600">Off: every chat booking is a request you confirm under Lead review.</span>
            {settings.autoConfirm && missing.length > 0 && (
              <span className="mt-1 block text-red-600">Still needed before anything is confirmed instantly: {missing.join(", ")}.</span>
            )}
          </span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Working days</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm">
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
          <label className="text-sm">
            <span className="text-xs font-bold uppercase text-slate-500">Arrival times offered (24h, comma-separated)</span>
            <input
              className={clsx(input, "mt-1 block w-full")}
              placeholder="e.g. 07:30, 12:00"
              defaultValue={settings.arrivalTimes.join(", ")}
              onBlur={(e) => setSettings({ ...settings, arrivalTimes: e.target.value.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)) })}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-bold uppercase text-slate-500">Jobs must finish by</span>
            <input type="time" className={clsx(input, "mt-1 block")} value={settings.dayEndTime ?? ""} onChange={(e) => setSettings({ ...settings, dayEndTime: e.target.value || null })} />
          </label>
          {(
            [
              ["moversPerDay", "Movers available per day"],
              ["bufferMinutes", "Gap kept free after each job (minutes)"],
              ["minNoticeHours", "Minimum notice (hours)"],
              ["maxDaysAhead", "Book up to (days ahead)"],
              ["autoConfirmMaxAud", "Only confirm instantly up to (AUD estimate, optional)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
              <input
                type="number"
                min={0}
                className={clsx(input, "mt-1 block w-32")}
                value={settings[key] ?? ""}
                onChange={(e) => setSettings({ ...settings, [key]: num(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <button type="button" disabled={busy} className={clsx(button, "mt-5")} onClick={() => void post({ action: "saveSettings", settings }, "Settings saved.")}>
          Save settings
        </button>
      </section>

      <Trucks trucks={data.trucks} busy={busy} onSave={(truck) => post({ action: "saveTruck", truck }, "Truck saved.")} />

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-navy">Booking calendar</h3>
          <div className="flex items-end gap-2 text-sm">
            <label>
              From <input type="date" className={input} defaultValue={data.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label>
              to <input type="date" className={input} defaultValue={data.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
            <button type="button" className={button} onClick={() => void load()}>
              Show
            </button>
          </div>
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
                {b.phone && `· ${b.phone}`} &middot; <span className="text-slate-500">{b.source === "chat" ? `chat ${b.quoteReference ?? ""}` : b.source}</span>
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
        <AddBooking trucks={data.trucks} busy={busy} onAdd={(booking) => post({ action: "addBooking", booking }, "Booking added.")} />
      </section>
    </div>
  );
}

function Trucks({ trucks, busy, onSave }: { trucks: Truck[]; busy: boolean; onSave: (t: Truck) => void }) {
  const [draft, setDraft] = useState<Truck>({ label: "", truckType: "4.5T", active: true, notes: null });
  return (
    <section className={box}>
      <h3 className="font-display text-lg font-bold text-navy">Trucks</h3>
      <p className="mt-1 text-sm text-slate-600">Every truck that can be booked, with its size. Untick &quot;active&quot; for a truck that&apos;s off the road.</p>
      <ul className="mt-3 space-y-2">
        {trucks.map((t) => (
          <TruckRow key={t.id} truck={t} busy={busy} onSave={onSave} />
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <input className={input} placeholder="Name / rego, e.g. Truck 2 (ABC123)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <select className={input} value={draft.truckType} onChange={(e) => setDraft({ ...draft, truckType: e.target.value })}>
          {TRUCK_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !draft.label.trim()}
          className={button}
          onClick={() => {
            onSave(draft);
            setDraft({ label: "", truckType: "4.5T", active: true, notes: null });
          }}
        >
          Add truck
        </button>
      </div>
    </section>
  );
}

function TruckRow({ truck, busy, onSave }: { truck: Truck; busy: boolean; onSave: (t: Truck) => void }) {
  const [t, setT] = useState(truck);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <input className={input} value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} />
      <select className={input} value={t.truckType} onChange={(e) => setT({ ...t, truckType: e.target.value })}>
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
  const blank: Override = { date: "", closed: true, moversAvailable: null, trucksUnavailable: [], note: null };
  const [draft, setDraft] = useState<Override>(blank);
  const name = (id: string) => props.trucks.find((t) => t.id === id)?.label ?? id;
  return (
    <section className={box}>
      <h3 className="font-display text-lg font-bold text-navy">Days off &amp; changes</h3>
      <p className="mt-1 text-sm text-slate-600">Close a date, take trucks off for a day, or change how many movers are available that day.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {props.overrides.length === 0 && <li className="text-slate-500">No changes coming up.</li>}
        {props.overrides.map((o) => (
          <li key={o.date} className="flex flex-wrap items-center gap-2">
            <strong>{o.date}</strong>
            {o.closed ? "closed" : [o.moversAvailable !== null && `${o.moversAvailable} movers`, o.trucksUnavailable.length > 0 && `off: ${o.trucksUnavailable.map(name).join(", ")}`].filter(Boolean).join(" · ")}
            {o.note && <span className="text-slate-500">({o.note})</span>}
            <button type="button" disabled={props.busy} className="text-xs font-bold text-red-600 underline" onClick={() => props.onDelete(o.date)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-sm">
        <input type="date" min={props.today} className={input} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={draft.closed} onChange={(e) => setDraft({ ...draft, closed: e.target.checked })} /> closed all day
        </label>
        {!draft.closed && (
          <>
            <label>
              movers that day <input type="number" min={0} className={clsx(input, "w-20")} value={draft.moversAvailable ?? ""} onChange={(e) => setDraft({ ...draft, moversAvailable: num(e.target.value) })} />
            </label>
            {props.trucks.map((t) => (
              <label key={t.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.trucksUnavailable.includes(t.id!)}
                  onChange={(e) =>
                    setDraft({ ...draft, trucksUnavailable: e.target.checked ? [...draft.trucksUnavailable, t.id!] : draft.trucksUnavailable.filter((x) => x !== t.id) })
                  }
                />
                {t.label} off
              </label>
            ))}
          </>
        )}
        <input className={input} placeholder="Note (optional)" value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value || null })} />
        <button
          type="button"
          disabled={props.busy || !draft.date}
          className={button}
          onClick={() => {
            props.onSave(draft);
            setDraft(blank);
          }}
        >
          Save day
        </button>
      </div>
    </section>
  );
}

function AddBooking({ trucks, busy, onAdd }: { trucks: Truck[]; busy: boolean; onAdd: (b: Record<string, unknown>) => void }) {
  const blank = { date: "", arrivalTime: "", hours: "", truckType: "4.5T", truckId: "", movers: "2", customerName: "", phone: "", fromText: "", toText: "", notes: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const ready = f.date && /^\d{2}:\d{2}$/.test(f.arrivalTime) && Number(f.hours) > 0 && Number(f.movers) > 0;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-xs font-bold uppercase text-slate-500">Add a phone / other booking</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input type="date" className={input} value={f.date} onChange={set("date")} />
        <input type="time" className={input} value={f.arrivalTime} onChange={set("arrivalTime")} />
        <input type="number" min={0.5} step={0.5} className={clsx(input, "w-24")} placeholder="hours" value={f.hours} onChange={set("hours")} />
        <select className={input} value={f.truckType} onChange={set("truckType")}>
          {TRUCK_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
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
        <input type="number" min={1} className={clsx(input, "w-20")} placeholder="movers" value={f.movers} onChange={set("movers")} />
        <input className={input} placeholder="Customer" value={f.customerName} onChange={set("customerName")} />
        <input className={input} placeholder="Phone" value={f.phone} onChange={set("phone")} />
        <input className={input} placeholder="From" value={f.fromText} onChange={set("fromText")} />
        <input className={input} placeholder="To" value={f.toText} onChange={set("toText")} />
        <input className={input} placeholder="Notes" value={f.notes} onChange={set("notes")} />
        <button
          type="button"
          disabled={busy || !ready}
          className={button}
          onClick={() => {
            onAdd({
              source: "phone",
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
      </div>
    </div>
  );
}
