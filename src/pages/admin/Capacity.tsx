import { useEffect, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { NO_FINISH_TIME, startTimesBetween, startTimesSummary } from "../../lib/startTimes";
import { box, button, Field, input, looksLikeEmail, num, SectionHeader, TRUCK_TYPES, useCapacity, type Driver, type Override, type Settings, type Truck } from "./capacityShared";
import { useAdminRole } from "./useAdminRole";

// "Settings" (full users only -- Blue Line, 28 Oct): what the chat uses to offer free arrival
// times and, only when instant confirmation is switched on, to confirm a booking on the spot;
// plus the driver and truck lists and days off. Bookings themselves -- seeing, adding, moving,
// cancelling, picking the driver -- are all on the Booking and trucks tab (TruckTrips.tsx), so
// there's no booking calendar here.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const missingForInstant = (s: Settings) =>
  [
    !s.workingDays.length && "working days",
    !s.arrivalTimes.length && "arrival times",
    !s.dayEndTime && "jobs must finish by",
    s.moversPerDay === null && "movers per day",
    s.minNoticeHours === null && "minimum notice",
    s.bufferMinutes === null && "gap after each job",
  ].filter(Boolean) as string[];

export type SettingsTab = "rules" | "drivers" | "trucks" | "off";

export default function Capacity() {
  return <SettingsSections />;
}

/**
 * The settings sections. `only`: one section, for the new dashboard's Settings tabs; without it,
 * the whole page. (A named export: React Router wraps a route's default export, dropping props.)
 */
export function SettingsSections({ only }: { only?: SettingsTab }) {
  const role = useAdminRole();
  const { data, message, busy, post } = useCapacity();
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setSettings(data.settings);
  }, [data]);

  if (role === "limited")
    return <p className="text-sm text-slate-600">Settings are only for full dashboard users. Bookings, trucks and drivers for each job are on the Booking and trucks tab.</p>;
  if (!data || !settings) return <p className="text-sm text-slate-500">{message?.text ?? "Loading..."}</p>;
  const missing = missingForInstant(settings);

  return (
    <div className="space-y-8">
      {!only && (
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Settings</h2>
          <p className="mt-1 text-sm text-slate-600">
            How bookings work, your drivers and trucks, and days that are different. The chat uses these to offer customers free arrival times. Bookings themselves are on the
            Booking and trucks tab -- <strong>every booking must be there</strong> (add phone and other bookings too), or the chat can&apos;t see it.
          </p>
        </div>
      )}
      {message && <p className={clsx("text-sm", message.error ? "text-red-600" : "text-green-700")}>{message.text}</p>}

      {/* ------------------------------------------------------------ settings */}
      {(!only || only === "rules") && (
        <section className={box}>
          <SectionHeader title="Booking settings" intro="How bookings work in general. Save after changing anything." />
          <label className="mt-4 flex items-start gap-3 rounded-lg bg-paper p-3">
            <input type="checkbox" className="mt-1" checked={settings.autoConfirm} onChange={(e) => setSettings({ ...settings, autoConfirm: e.target.checked })} />
            <span className="text-sm">
              <strong>Confirm bookings instantly in the chat</strong>
              <span className="block text-slate-600">
                On: the chat confirms a booking on the spot when the chosen time has a free truck of the right size and enough movers. Off: every chat booking is a request you
                confirm on Today.
              </span>
              {settings.autoConfirm && missing.length > 0 && (
                <span className="mt-1 block text-red-600">Nothing is confirmed instantly until these are filled in: {missing.join(", ")}.</span>
              )}
            </span>
          </label>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="text-sm">
              <span className="block text-xs font-semibold text-slate-500">Working days</span>
              <span className="mb-1 block text-[11.5px] text-slate-400">Days customers can book online. Click a day to turn it on or off.</span>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label
                    key={d}
                    className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 has-checked:border-navy has-checked:bg-navy has-checked:text-white"
                  >
                    <input
                      className="sr-only"
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
            <StartTimes settings={settings} onChange={setSettings} />
            <Field label="Jobs must finish by" hint="End of your working day. A time isn't offered if the job would run past it.">
              <label className="mb-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.dayEndTime === NO_FINISH_TIME}
                  onChange={(e) => setSettings({ ...settings, dayEndTime: e.target.checked ? NO_FINISH_TIME : null })}
                />
                No finish time (we work 24/7)
              </label>
              {settings.dayEndTime !== NO_FINISH_TIME && (
                <input type="time" className={input} value={settings.dayEndTime ?? ""} onChange={(e) => setSettings({ ...settings, dayEndTime: e.target.value || null })} />
              )}
            </Field>
            {(
              [
                ["moversPerDay", "Movers available per day", "Total movers you have on a normal day, across all jobs."],
                ["bufferMinutes", "Gap after each job (minutes)", "Time kept free before the same truck can start its next job -- travel and overruns."],
                ["minNoticeHours", "Minimum notice (hours)", "How soon a job can be booked online. 48 = nothing for today or tomorrow."],
              ] as const
            ).map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <input
                  type="number"
                  min={0}
                  className={clsx(input, "w-32")}
                  value={settings[key] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [key]: num(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <button type="button" disabled={busy} className={clsx(button, "mt-5")} onClick={() => void post({ action: "saveSettings", settings }, "Settings saved.")}>
            Save settings
          </button>
        </section>
      )}

      {(!only || only === "drivers") && <Drivers drivers={data.drivers} busy={busy} onSave={(driver) => post({ action: "saveDriver", driver }, "Driver saved.")} />}

      {(!only || only === "trucks") && <Trucks trucks={data.trucks} busy={busy} onSave={(truck) => post({ action: "saveTruck", truck }, "Truck saved.")} />}

      {!only && (
        <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
          Which truck and driver goes when, with the customer&apos;s details: see the{" "}
          <Link to="/admin/classic/trips" className="font-bold text-navy underline">
            Booking and trucks
          </Link>{" "}
          tab.
        </p>
      )}

      {(!only || only === "off") && (
        <DayChanges
          overrides={data.overrides}
          trucks={data.trucks}
          today={data.today}
          busy={busy}
          onSave={(override) => post({ action: "saveOverride", override }, "Day saved.")}
          onDelete={(date) => post({ action: "deleteOverride", date }, "Day change removed.")}
        />
      )}
    </div>
  );
}

/**
 * Arrival times as "every N minutes from the first start to the last start" (Ayesha, 2026-10-28).
 * The chat asks the customer what time suits them and books it if it is one of these and free;
 * otherwise it offers the nearest free ones.
 */
function StartTimes({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const saved = startTimesSummary(settings.arrivalTimes);
  const [first, setFirst] = useState(saved.first);
  const [last, setLast] = useState(saved.last);
  const [every, setEvery] = useState(saved.everyMinutes);
  const apply = (f: string, l: string, e: number) => onChange({ ...settings, arrivalTimes: startTimesBetween(f, l, e) });
  const count = settings.arrivalTimes.length;
  return (
    <div className="text-sm">
      <span className="block text-xs font-semibold text-slate-500">Arrival times</span>
      <span className="mb-1 block text-[11.5px] text-slate-400">
        Times the crew can arrive. The chat asks the customer what time suits them, and offers the nearest free times if it doesn&apos;t. For 24/7, use 00:00 to 23:30.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600">From</span>
        <input type="time" className={input} value={first} onChange={(e) => (setFirst(e.target.value), apply(e.target.value, last, every))} aria-label="First arrival time" />
        <span className="text-xs text-slate-600">to</span>
        <input type="time" className={input} value={last} onChange={(e) => (setLast(e.target.value), apply(first, e.target.value, every))} aria-label="Last arrival time" />
        <span className="text-xs text-slate-600">every</span>
        <select
          className={input}
          value={every}
          onChange={(e) => (setEvery(Number(e.target.value)), apply(first, last, Number(e.target.value)))}
          aria-label="Minutes between arrival times"
        >
          {[15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <span className={clsx("mt-1 block text-xs", count ? "text-slate-500" : "text-amber-700")}>
        {count ? `${count} arrival times, ${settings.arrivalTimes[0]} to ${settings.arrivalTimes[count - 1]}.` : "No arrival times yet -- the chat can only take booking requests."}
      </span>
    </div>
  );
}

const blankDriver = (): Driver => ({ name: "", phone: null, email: null, active: true, notes: null });

function Drivers({ drivers, busy, onSave }: { drivers: Driver[]; busy: boolean; onSave: (d: Driver) => Promise<string | null> | void }) {
  const [draft, setDraft] = useState<Driver>(blankDriver());
  const draftOk = draft.name.trim() !== "" && looksLikeEmail(draft.email);
  return (
    <section className={box}>
      <SectionHeader
        title="Drivers"
        intro="Everyone who drives a truck. The driver for each job is picked on the Booking and trucks tab, at least 2 days before the move -- if a job still has no driver 2 days before, it's flagged there and the team is emailed. The picked driver is emailed the date, time, pick-up, drop-off and the customer's name, address and phone the day before the move (straight away if picked later). Without an email address a driver can't be told."
      />
      <ul className="mt-3">
        {drivers.map((d) => (
          <DriverRow key={d.id} driver={d} busy={busy} onSave={onSave} />
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
          <input
            type="email"
            className={clsx(input, !looksLikeEmail(draft.email) && "border-red-500")}
            value={draft.email ?? ""}
            onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
          />
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

function DriverRow({ driver, busy, onSave }: { driver: Driver; busy: boolean; onSave: (d: Driver) => Promise<string | null> | void }) {
  const [d, setD] = useState(driver);
  useEffect(() => setD(driver), [driver]);
  const emailOk = looksLikeEmail(d.email);
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2.5 text-sm first:border-t-0">
      <input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Name" />
      <input
        type="tel"
        className={clsx(input, "w-36")}
        placeholder="mobile"
        value={d.phone ?? ""}
        onChange={(e) => setD({ ...d, phone: e.target.value || null })}
        aria-label="Mobile"
      />
      <input
        type="email"
        className={clsx(input, "w-56", !emailOk && "border-red-500")}
        placeholder="email"
        value={d.email ?? ""}
        onChange={(e) => setD({ ...d, email: e.target.value || null })}
        aria-label="Email"
      />
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> active
      </label>
      <button
        type="button"
        disabled={busy || !d.name.trim() || !emailOk}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-bold text-navy hover:border-navy disabled:opacity-40"
        onClick={() => void onSave({ ...d, name: d.name.trim() })}
      >
        Save
      </button>
      {!d.email && d.active && <span className="text-xs font-bold text-amber-700">no email -- can&apos;t be told about jobs</span>}
    </li>
  );
}

function Trucks({ trucks, busy, onSave }: { trucks: Truck[]; busy: boolean; onSave: (t: Truck) => void }) {
  const [draft, setDraft] = useState<Truck>({ label: "", truckType: "4.5T", active: true, notes: null, driverId: null });
  return (
    <section className={box}>
      <SectionHeader
        title="Trucks"
        intro="Every truck that can be booked, with its size. Add each truck once. The chat picks a free truck of the right size for each booking; the driver is picked per job on the Booking and trucks tab."
      />
      <ul className="mt-3">
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

function TruckRow({ truck, busy, onSave }: { truck: Truck; busy: boolean; onSave: (t: Truck) => void }) {
  const [t, setT] = useState(truck);
  useEffect(() => setT(truck), [truck]);
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2.5 text-sm first:border-t-0">
      <input className={input} value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} aria-label="Name / rego" />
      <select className={input} value={t.truckType} onChange={(e) => setT({ ...t, truckType: e.target.value })} aria-label="Size">
        {TRUCK_TYPES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} /> active
      </label>
      <button type="button" disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-bold text-navy hover:border-navy disabled:opacity-40" onClick={() => onSave(t)}>
        Save
      </button>
    </li>
  );
}

function DayChanges(props: { overrides: Override[]; trucks: Truck[]; today: string; busy: boolean; onSave: (o: Override) => void; onDelete: (date: string) => void }) {
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
            <button type="button" disabled={props.busy} className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 hover:border-red-400 disabled:opacity-40" onClick={() => props.onDelete(o.date)}>
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
          <span className="block text-xs font-semibold text-slate-500">Closed all day</span>
          <span className="mb-1 block text-[11.5px] text-slate-400">Tick for no online bookings at all that day (holiday, staff event).</span>
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
              <span className="block text-xs font-semibold text-slate-500">Trucks off that day</span>
              <span className="mb-1 block text-[11.5px] text-slate-400">Tick any truck that can&apos;t be used that day (service, repair).</span>
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
