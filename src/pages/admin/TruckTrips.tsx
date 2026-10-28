import { useEffect, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { DRIVER_NEEDED_DAYS_BEFORE, driverOverdue } from "../../lib/drivers";
import { shortDay } from "../../lib/noticeTiming";
import { describeProblem, statusAt, time12, toMinutes, tripEnd, tripProblem, truckDay } from "../../lib/truckTrips";
import AddBooking from "./AddBooking";
import { box, button, Field, input, SectionHeader, useCapacity, type Booking, type CapacityData } from "./capacityShared";
import { JobCard } from "./JobCard";
import { useAdminRole } from "./useAdminRole";
import { useJobs } from "./useJobs";

// "Booking and trucks": which truck goes out when, who drives it and who the customer is. A trip is
// a booking in the same calendar the chat reads (Settings), so assigning, editing
// or cancelling one changes what the chat offers straight away. The same truck -- or the
// same driver -- can't be on two trips at overlapping times. The driver is picked for each job
// by hand (Blue Line, 28 Oct): jobs with no driver are listed at the top, in red from 2 days
// before the move (the team is emailed then too). Jobs whose date has passed are listed under
// "To mark complete". The driver's "New job" email and the customer's booking email go out
// the DAY BEFORE the move (straight away if the move is today or tomorrow); a change or a
// cancellation before then simply changes what is sent. After they have gone, changes are emailed at once.

const DAY_START = "06:00";
const DAY_END = "20:00";
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

interface TripForm {
  id?: string;
  truckId: string;
  date: string;
  start: string;
  end: string;
  movers: string;
  /** "" = no driver picked yet. */
  driverId: string;
  customerName: string;
  phone: string;
  customerEmail: string;
  fromText: string;
  toText: string;
  notes: string;
}

const looksLikeEmail = (v: string) => v.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function TruckTrips() {
  const { data, message, busy, post, changeRange } = useCapacity();
  const role = useAdminRole();
  const jobs = useJobs();
  const [jobNotice, setJobNotice] = useState<string | null>(null);
  const toComplete = jobs.data?.jobs.filter((j) => j.toComplete) ?? [];
  if (!data) return <p className="text-sm text-slate-500">{message?.text ?? "Loading..."}</p>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-navy">Booking and trucks</h2>
        <p className="mt-1 text-sm text-slate-600">
          Which truck goes out when, who drives it and who the customer is. A truck on a trip shows as <strong>Assigned / Engaged</strong> for that time and{" "}
          <strong>Available</strong> the rest of the day. The chat reads the same trips, so it only offers customers times when a truck is free. Pick the driver for
          every job at least {DRIVER_NEEDED_DAYS_BEFORE} days before the move.
          {role === "full" && (
            <>
              {" "}
              Trucks, drivers and booking settings are on{" "}
              <Link to="/admin/capacity" className="font-bold text-navy underline">
                Settings
              </Link>
              .
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <strong>Emails:</strong> the driver&apos;s &quot;New job&quot; email and the customer&apos;s booking email go out the <strong>day before the move</strong> (9am
          Melbourne time), or straight away if the move is today or tomorrow. If you change the date, driver or truck first, or cancel, the emails follow. Once sent,
          any change is emailed at once.
        </p>
        <button
          type="button"
          disabled={busy}
          className="mt-2 text-xs font-bold text-navy underline"
          onClick={() => void post({ action: "sendDueNotices" }, "Checked for emails that are due.")}
        >
          Send due emails now
        </button>
        <span className="ml-2 text-xs text-slate-500">(the live site does this every hour; use this on the test link)</span>
        {message && <p className={clsx("mt-3 text-sm", message.error ? "text-red-600" : "text-green-700")}>{message.text}</p>}
      </div>
      <TripsDay
        data={data}
        busy={busy}
        onDay={(tripDay) => changeRange({ tripDay })}
        onSave={(trip, notifyCustomer) => post({ action: "saveTrip", trip, notifyCustomer }, trip.id ? "Trip updated." : "Trip added.")}
        onCancel={(b) =>
          window.confirm(
            b.quoteReference
              ? `This trip is the booking for ${b.customerName ?? b.quoteReference}. Cancelling it cancels their booking too, and tells the driver it's off if they were already emailed (the customer isn't emailed about a cancellation -- let them know yourself). To only change the truck, driver or times, use Edit instead.`
              : "Cancel this trip? The truck shows as Available again. If its driver was already emailed, they are told the job is off; emails still waiting for the day before are cancelled.",
          )
            ? post({ action: "cancelBooking", id: b.id }, b.quoteReference ? "Booking cancelled." : "Trip cancelled.")
            : Promise.resolve(null)
        }
      />
      <section>
        <h2 className="font-display text-xl font-bold text-navy">To mark complete</h2>
        <p className="mt-1 text-sm text-slate-600">The moving date has passed -- record the final amount charged on the day (or cancel it).</p>
        {jobNotice && <p className="mt-2 text-sm text-green-700">{jobNotice}</p>}
        {jobs.error && <p className="mt-2 text-sm text-red-600">{jobs.error}</p>}
        {jobs.data && toComplete.length === 0 && <p className="mt-3 text-sm text-slate-500">Nothing to mark complete.</p>}
        <ul className="mt-3 space-y-3">
          {toComplete.map((j) => (
            <JobCard
              key={j.reference}
              job={j}
              onChanged={(m) => {
                setJobNotice(m);
                jobs.reload();
              }}
            />
          ))}
        </ul>
      </section>
      {/* A job booked another way (phone, Airtasker, Moval...) -- after the trip form, at the bottom. */}
      <AddBooking trucks={data.trucks} busy={busy} onAdd={(booking, notifyCustomer) => post({ action: "addBooking", booking, notifyCustomer }, "Booking added.")} />
    </div>
  );
}

function TripsDay(props: {
  data: CapacityData;
  busy: boolean;
  onDay: (date: string) => void;
  onSave: (trip: Record<string, unknown> & { id?: string }, notifyCustomer: boolean) => Promise<string | null>;
  onCancel: (b: Booking) => Promise<string | null>;
}) {
  const { data } = props;
  const day = data.tripDay;
  const blank = (date = day): TripForm => ({
    truckId: "",
    date,
    start: "",
    end: "",
    movers: "2",
    driverId: "",
    customerName: "",
    phone: "",
    customerEmail: "",
    fromText: "",
    toText: "",
    notes: "",
  });
  const [f, setF] = useState<TripForm>(blank());
  const [serverError, setServerError] = useState<string | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  // A new trip goes on the day being shown.
  useEffect(() => setF((x) => (x.id ? x : { ...x, date: day })), [day]);

  const activeTrucks = data.trucks.filter((t) => t.active);
  const truckName = (id: string | null) => data.trucks.find((t) => t.id === id)?.label ?? "That truck";
  const off = data.overrides.find((o) => o.date === day)?.trucksUnavailable ?? [];
  const isToday = day === data.today;
  const confirmed = data.dayTrips.filter((b) => b.status === "confirmed");
  const needTruck = confirmed.filter((b) => !b.truckId);
  const driverNames = [...new Set([...data.bookings, ...data.dayTrips].map((b) => b.driverName?.trim()).filter((d): d is string => Boolean(d)))].sort();
  const chosenDriver = data.drivers.find((d) => d.id === f.driverId);
  // Every upcoming job with no driver picked yet (the next 30 days), soonest first.
  const needDriver = data.bookings
    .filter((b) => b.status === "confirmed" && !b.driverName?.trim() && b.date >= data.today)
    .sort((a, b) => `${a.date}${a.arrivalTime}`.localeCompare(`${b.date}${b.arrivalTime}`));
  const pickDriver = (b: Booking) => {
    if (b.date !== day) props.onDay(b.date);
    edit(b);
  };
  const byDriver = driverNames
    .map((d) => ({ driver: d, trips: confirmed.filter((b) => b.driverName?.trim() === d).sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime)) }))
    .filter((x) => x.trips.length > 0);
  const noDriver = confirmed.filter((b) => b.truckId && !b.driverName?.trim());

  // Live check while typing (the server checks again inside the booking lock).
  const timesTyped = /^\d{2}:\d{2}$/.test(f.start) && /^\d{2}:\d{2}$/.test(f.end);
  const problem =
    f.truckId && timesTyped && f.date === day
      ? tripProblem({ id: f.id, truckId: f.truckId, date: f.date, start: f.start, end: f.end, driverName: chosenDriver?.name ?? null }, data.dayTrips, off)
      : null;
  const emailOk = looksLikeEmail(f.customerEmail);
  const ready = Boolean(f.truckId && f.date && timesTyped && Number(f.movers) > 0 && !problem && emailOk);

  const set = (k: keyof TripForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setServerError(null);
    setF({ ...f, [k]: e.target.value });
    if (k === "date" && e.target.value && e.target.value !== day) props.onDay(e.target.value);
  };

  const edit = (b: Booking) => {
    setServerError(null);
    setNotifyCustomer(b.customerNoticeWanted);
    setF({
      id: b.id,
      truckId: b.truckId ?? "",
      date: b.date,
      start: b.arrivalTime,
      end: tripEnd(b),
      movers: String(b.movers),
      driverId: b.driverId ?? "",
      customerName: b.customerName ?? "",
      phone: b.phone ?? "",
      customerEmail: b.customerEmail ?? "",
      fromText: b.fromText ?? "",
      toText: b.toText ?? "",
      notes: b.notes ?? "",
    });
    document.getElementById("trip-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function save() {
    const text = (v: string) => v.trim() || null;
    const error = await props.onSave(
      {
      ...(f.id ? { id: f.id } : {}),
      truckId: f.truckId,
      date: f.date,
      start: f.start,
      end: f.end,
      movers: Number(f.movers),
      driverId: f.driverId || null,
      customerName: text(f.customerName),
      phone: text(f.phone),
      customerEmail: text(f.customerEmail),
      fromText: text(f.fromText),
      toText: text(f.toText),
      notes: text(f.notes),
      },
      notifyCustomer && Boolean(text(f.customerEmail)),
    );
    setServerError(error);
    if (!error) setF(blank(f.date));
  }

  const span = toMinutes(DAY_END) - toMinutes(DAY_START);
  const at = (hhmm: string) => Math.min(100, Math.max(0, ((toMinutes(hhmm) - toMinutes(DAY_START)) / span) * 100));

  return (
    <>
      {/* ------------------------------------------------------------ jobs with no driver */}
      {needDriver.length > 0 && (
        <section className={clsx(box, needDriver.some((b) => driverOverdue(b.date, data.today)) && "ring-2 ring-red-300")}>
          <SectionHeader
            title="Jobs with no driver yet"
            intro={`Pick a driver for each job at least ${DRIVER_NEEDED_DAYS_BEFORE} days before the move. Red = the move is ${DRIVER_NEEDED_DAYS_BEFORE} days away or less: the team has been emailed.`}
          />
          <ul className="mt-3 space-y-1 text-sm">
            {needDriver.map((b) => {
              const overdue = driverOverdue(b.date, data.today);
              return (
                <li key={b.id} className={clsx("flex flex-wrap items-center gap-x-2", overdue ? "font-bold text-red-700" : "text-slate-700")}>
                  <span>
                    {shortDate(b.date)}, {time12(b.arrivalTime)} · {truckName(b.truckId)} · {b.customerName ?? b.quoteReference ?? "job"}
                    {overdue && " -- needs a driver now"}
                  </span>
                  <button type="button" disabled={props.busy} className="text-xs font-bold text-navy underline" onClick={() => pickDriver(b)}>
                    Pick a driver
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------ the day */}
      <section className={box}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Day" hint="The day to show.">
            <input type="date" className={input} value={day} onChange={(e) => e.target.value && props.onDay(e.target.value)} />
          </Field>
          <button type="button" className="mb-1 text-xs font-bold text-navy underline" onClick={() => props.onDay(data.today)}>
            Today
          </button>
          <span className="mb-1 text-sm font-bold text-navy">
            {shortDate(day)}
            {isToday && <span className="font-normal text-slate-600"> · now {time12(data.nowTime)}</span>}
          </span>
        </div>

        {activeTrucks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No trucks yet -- add them under{" "}
            <Link to="/admin/capacity" className="font-bold text-navy underline">
              Settings &gt; Trucks
            </Link>
            , e.g. &quot;Baby Blue&quot;.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
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
                            {s.trip!.driverName ? ` · ${s.trip!.driverName}` : ""}
                          </div>
                        ))}
                    </div>
                  </div>
                  <ul className="mt-1 space-y-1 sm:ml-40">
                    {isOff ? (
                      <li className="text-xs text-slate-500">Marked off in Days off &amp; changes -- not offered to customers.</li>
                    ) : (
                      segments.map((s) =>
                        s.engaged ? (
                          <TripRow key={s.trip!.id} trip={s.trip as Booking} today={data.today} busy={props.busy} onEdit={edit} onCancel={props.onCancel} />
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
            <span className="block text-xs text-slate-600">They still hold a truck of their size for the chat. Assign a truck and driver so everyone knows who goes.</span>
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
      </section>

      {/* ------------------------------------------------------------ drivers */}
      {(byDriver.length > 0 || noDriver.length > 0) && (
        <section className={box}>
          <SectionHeader title="Drivers this day" intro="Who is driving which trip." />
          <ul className="mt-3 space-y-1 text-sm">
            {byDriver.map(({ driver, trips }) => (
              <li key={driver}>
                <strong>{driver}</strong>:{" "}
                {trips.map((b) => `${time12(b.arrivalTime)} - ${time12(tripEnd(b))} ${truckName(b.truckId)}${b.customerName ? ` (${b.customerName})` : ""}`).join(" · ")}
              </li>
            ))}
            {noDriver.length > 0 && (
              <li className="text-amber-700">
                <strong>No driver yet</strong>: {noDriver.map((b) => `${time12(b.arrivalTime)} ${truckName(b.truckId)}`).join(" · ")} -- use Edit to pick one.
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------ the form */}
      <section id="trip-form" className={clsx(box, f.id && "ring-2 ring-action")}>
        <SectionHeader
          title={f.id ? "Edit trip" : "Assign a truck to a trip"}
          intro={
            f.id
              ? "Change anything and save. If the trip is a customer's booking, a new date or start time moves their booking too."
              : "Pick the truck, the driver and the time it's out. Add the customer's details so the driver has them."
          }
        />
        <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Truck and time</h4>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <Field label="Truck" hint="The truck going out.">
            <select className={input} value={f.truckId} onChange={set("truckId")} disabled={activeTrucks.length === 0}>
              <option value="">{activeTrucks.length ? "choose a truck" : "no trucks yet -- add one first"}</option>
              {activeTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.truckType})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driver" hint={`Who drives this job. Pick one at least ${DRIVER_NEEDED_DAYS_BEFORE} days before the move.`}>
            <select className={input} value={f.driverId} onChange={set("driverId")}>
              <option value="">not picked yet</option>
              {data.drivers
                .filter((d) => d.active || d.id === f.driverId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.email ? "" : " (no email)"}
                  </option>
                ))}
            </select>
            {chosenDriver && !chosenDriver.email && <span className="mt-1 block text-xs font-bold text-amber-700">{chosenDriver.name} has no email, so they won&apos;t get the job by email.</span>}
          </Field>
          <Field label="Movers" hint="Crew on this trip, driver included.">
            <input type="number" min={1} className={clsx(input, "w-20")} value={f.movers} onChange={set("movers")} />
          </Field>
          <Field label="Date" hint="Day of the trip.">
            <input type="date" className={input} value={f.date} onChange={set("date")} />
          </Field>
          <Field label="Start time" hint="When the truck heads out, e.g. 8:00 AM.">
            <input type="time" className={input} value={f.start} onChange={set("start")} />
          </Field>
          <Field label="End time" hint="When it's free again, e.g. 11:00 AM.">
            <input type="time" className={input} value={f.end} onChange={set("end")} />
          </Field>
        </div>

        <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Customer (optional)</h4>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <Field label="Name" hint="Customer's name.">
            <input className={input} value={f.customerName} onChange={set("customerName")} />
          </Field>
          <Field label="Phone" hint="So the driver can call ahead.">
            <input type="tel" className={input} value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" hint="Customer's email.">
            <input type="email" className={clsx(input, !emailOk && "border-red-500")} value={f.customerEmail} onChange={set("customerEmail")} />
          </Field>
          <Field label="Pick-up address" hint="Where the truck goes first.">
            <input className={input} value={f.fromText} onChange={set("fromText")} />
          </Field>
          <Field label="Drop-off address" hint="Where everything goes.">
            <input className={input} value={f.toText} onChange={set("toText")} />
          </Field>
          <Field label="Notes" hint="e.g. Airtasker job, gate code, depot run.">
            <input className={input} value={f.notes} onChange={set("notes")} />
          </Field>
        </div>

        {(problem || serverError || !emailOk) && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-2 text-sm font-bold text-red-700">
            {problem ? describeProblem(problem, truckName(f.truckId)) : !emailOk ? "That email address doesn't look right." : serverError}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" disabled={props.busy || !ready} className={button} onClick={() => void save()}>
            {f.id ? "Save changes" : "Assign truck"}
          </button>
          {(f.id || f.truckId || f.start || f.end || f.driverId || f.customerName) && (
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
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
          Email the customer their booking details the day before the move, and tell them if it changes (needs their email)
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Truck, date, start and end time are required. The same truck or driver can&apos;t be on two trips at overlapping times. The driver is emailed the job the day before the move (straight away if it is today or tomorrow), and again if you change it after that.
        </p>
      </section>
    </>
  );
}

function TripRow({ trip, today, busy, onEdit, onCancel }: { trip: Booking; today: string; busy: boolean; onEdit: (b: Booking) => void; onCancel: (b: Booking) => Promise<string | null> }) {
  const route = [trip.fromText, trip.toText].filter(Boolean).join(" → ");
  const contact = [trip.phone, trip.customerEmail].filter(Boolean).join(" · ");
  return (
    <li className="rounded-md border border-orange-100 bg-orange-50/50 px-2 py-1">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-bold text-orange-700">Assigned / Engaged</span>
        <span>
          {time12(trip.arrivalTime)} - {time12(tripEnd(trip))}
        </span>
        <span className={clsx(trip.driverName ? "text-slate-700" : driverOverdue(trip.date, today) ? "font-bold text-red-700" : "text-amber-700")}>
          · driver: {trip.driverName || "not picked yet"}
        </span>
        {trip.driverName && (
          <span className={clsx("text-xs", trip.driverNotifiedAt ? "text-green-700" : "text-amber-700")}>
            {trip.driverNotifiedAt
              ? "emailed"
              : !trip.driverHasEmail
                ? "no email on file -- not told"
                : trip.noticeDueOn > today
                  ? `email scheduled for ${shortDay(trip.noticeDueOn)}`
                  : "not emailed yet"}
          </span>
        )}
        {trip.customerNoticeWanted && (
          <span className={clsx("text-xs", trip.customerNotifiedAt ? "text-green-700" : "text-amber-700")}>
            · customer {trip.customerNotifiedAt ? "emailed" : trip.noticeDueOn > today ? `email scheduled for ${shortDay(trip.noticeDueOn)}` : "email not sent yet"}
          </span>
        )}
        <button type="button" disabled={busy} className="text-xs font-bold text-navy underline" onClick={() => onEdit(trip)}>
          Edit
        </button>
        <button type="button" disabled={busy} className="text-xs font-bold text-red-600 underline" onClick={() => void onCancel(trip)}>
          Cancel
        </button>
      </div>
      {(trip.customerName || contact || route || trip.quoteReference || trip.notes) && (
        <div className="text-xs text-slate-600">
          {[trip.customerName, contact, route, trip.quoteReference, trip.notes].filter(Boolean).join(" · ")}
        </div>
      )}
    </li>
  );
}
