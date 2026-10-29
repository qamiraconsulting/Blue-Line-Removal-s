import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import clsx from "clsx";
import { DRIVER_NEEDED_DAYS_BEFORE, driverOverdue } from "../../lib/drivers";
import { shortDay } from "../../lib/noticeTiming";
import { time12, tripEnd } from "../../lib/truckTrips";
import { useCapacity, type Booking } from "../admin/capacityShared";
import { REASONS } from "../admin/JobCard";
import { useAdminApi } from "../admin/useAdminApi";
import { useAdminRole } from "../admin/useAdminRole";
import { aud, useJobs } from "../admin/useJobs";
import { addDays, jobPrice, JobPanel, melbourneToday, needsDriver, Notice, Panel, route, waited } from "./shared";

// Today: everything that needs a person, in one list, each item with its own button -- it
// replaces Overview's "Right now" tiles and Lead review's lists (Blue Line approved the
// prototype). Beside it: the trucks on the road today and tomorrow. Matt (limited) sees the
// booking side only: drivers to pick and the trucks.

interface LeadRow {
  id: string;
  customerName: string | null;
  fromText: string | null;
  toText: string | null;
  quoteReference: string | null;
  notes: string | null;
  updatedAt: string;
  conversationId: string | null;
}

export default function Today() {
  const role = useAdminRole();
  const full = role === "full";
  const navigate = useNavigate();
  const { adminFetch } = useAdminApi();
  const today = useMemo(melbourneToday, []);
  const month = useMemo(() => ({ from: `${today.slice(0, 7)}-01`, to: today }), [today]);
  const jobs = useJobs(month);
  const cap = useCapacity();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!full) return;
    adminFetch("/api/admin/leads")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d: { leads: LeadRow[] }) => setLeads(d.leads))
      .catch(() => setLeads([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const all = jobs.data?.jobs ?? [];
  const openJob = all.find((j) => j.reference === open) ?? null;
  const byRef = (ref: string | null) => (ref ? all.find((j) => j.reference === ref) : undefined);
  const changed = (m: string) => {
    setNotice(m);
    jobs.reload();
    void cap.load();
  };

  const confirm = all.filter((j) => j.status === "booking_requested");
  const quote = all.filter((j) => j.status === "waiting_for_quote").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const complete = all.filter((j) => j.toComplete);
  const follow = all.filter((j) => j.status === "estimate_sent" || j.status === "quoted");
  const bookings = cap.data?.bookings ?? [];
  const noDriver = bookings.filter((b) => needsDriver(b, today)).sort((a, b) => `${a.date}${a.arrivalTime}`.localeCompare(`${b.date}${b.arrivalTime}`));
  const chats = leads ?? [];
  const count = noDriver.length + (full ? confirm.length + quote.length + chats.length + complete.length : 0);

  async function pickDriver(b: Booking, driverId: string) {
    if (!b.truckId || !driverId) return;
    const name = cap.data?.drivers.find((d) => d.id === driverId)?.name ?? "Driver";
    await cap.post(
      {
        action: "saveTrip",
        notifyCustomer: b.customerNoticeWanted && Boolean(b.customerEmail),
        trip: {
          id: b.id,
          truckId: b.truckId,
          date: b.date,
          start: b.arrivalTime,
          end: tripEnd(b),
          movers: b.movers,
          driverId,
          customerName: b.customerName,
          phone: b.phone,
          customerEmail: b.customerEmail,
          fromText: b.fromText,
          toText: b.toText,
          notes: b.notes,
        },
      },
      `${name} is driving ${b.customerName ?? "the job"} on ${shortDay(b.date)}.`,
    );
  }

  const s = jobs.data?.summary;
  const openRequests = all.filter((j) => ["waiting_for_quote", "estimate_sent", "quoted", "booking_requested"].includes(j.status)).length;

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{new Date(`${today}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</p>
        <h1 className="font-display text-[26px] font-black text-navy">Today</h1>
        <p className="mt-1 text-sm text-slate-600">
          {!jobs.data && !cap.data ? "Loading..." : count ? `${count} ${count === 1 ? "thing needs" : "things need"} someone. Work down the list; each one opens the job.` : "Nothing needs anyone right now."}
        </p>
      </div>
      <Notice text={jobs.error ?? (cap.message?.error ? cap.message.text : null)} error />
      <Notice text={notice ?? (cap.message && !cap.message.error ? cap.message.text : null)} />

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Booked, next 7 days" value={s.now.bookedNext7Days.jobs} sub={`${aud(s.now.bookedNext7Days.valueAud)} in jobs`} to="/admin/trips" />
          {full && (
            <>
              <Kpi label="Open requests" value={openRequests} sub="waiting on us or the customer" to="/admin/new/requests" />
              <Kpi label="Booked this month" value={s.inPeriod.conversionPercent === null ? "-" : `${s.inPeriod.conversionPercent}%`} sub={`${s.inPeriod.booked} of ${s.inPeriod.requests} requests`} />
              <Kpi label="Completed this month" value={aud(s.inPeriod.completed.revenueAud)} sub={`${s.inPeriod.completed.jobs} jobs, final amounts`} />
            </>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Panel title="Needs someone">
          {full && (
            <>
              <Group title="Confirm bookings" hint="Customer agreed to book" items={confirm} hot empty="No booking requests waiting.">
                {(j) => (
                  <Row key={j.reference} onOpen={() => setOpen(j.reference)} who={j.customerName} meta={<>{route(j)} · {j.movingDate ? shortDay(j.movingDate) : "no date"}{j.arrivalTime && ` ${time12(j.arrivalTime)}`} · {aud(jobPrice(j))}{j.depositStatus === "paid" && <b className="text-eco"> · Deposit paid</b>}</>}>
                    <Btn primary onClick={() => setOpen(j.reference)}>Review &amp; confirm</Btn>
                  </Row>
                )}
              </Group>
              <Group title="Send quotes" hint="Form or chat couldn't price it" items={quote} hot empty="Nothing waiting for a quote.">
                {(j) => {
                  const late = Date.now() - new Date(j.createdAt).getTime() > 2 * 3_600_000;
                  return (
                    <Row key={j.reference} onOpen={() => setOpen(j.reference)} who={j.customerName} meta={<>{(j.manualReason && REASONS[j.manualReason]) ?? "Needs a quote"} · {route(j)} · <b className={late ? "text-red-600" : "text-action-dim"}>waiting {waited(j.createdAt)}</b></>}>
                      <Btn primary onClick={() => setOpen(j.reference)}>Send quote</Btn>
                    </Row>
                  );
                }}
              </Group>
            </>
          )}
          <Group title="Pick a driver" hint={`At least ${DRIVER_NEEDED_DAYS_BEFORE} days before the move`} items={noDriver} hot empty="Every upcoming job has a driver.">
            {(b) => {
              const overdue = driverOverdue(b.date, today);
              const job = byRef(b.quoteReference);
              return (
                <Row
                  key={b.id}
                  onOpen={job ? () => setOpen(job.reference) : undefined}
                  who={b.customerName ?? b.quoteReference ?? "Trip"}
                  meta={<>{shortDay(b.date)} {time12(b.arrivalTime)} · {cap.data?.trucks.find((t) => t.id === b.truckId)?.label ?? "No truck"}{overdue && <b className="text-red-600"> · Needs a driver now</b>}</>}
                >
                  {b.truckId ? (
                    <select
                      aria-label={`Driver for ${b.customerName ?? "this job"}`}
                      disabled={cap.busy}
                      defaultValue=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => void pickDriver(b, e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="">Pick driver</option>
                      {cap.data?.drivers.filter((d) => d.active && d.id).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Link to="/admin/trips" className="text-xs font-bold text-navy underline">Assign a truck first</Link>
                  )}
                </Row>
              );
            }}
          </Group>
          {full && (
            <>
              <Group title="Chats waiting for a person" hint="Handed over by the chat" items={chats} hot empty="No chats waiting.">
                {(l) => (
                  <Row key={l.id} onOpen={l.conversationId ? () => navigate(`/admin/new/chat/${l.conversationId}`) : undefined} who={l.customerName ?? "Unnamed enquiry"} meta={l.notes ? `“${l.notes}”` : `${l.fromText ?? "?"} → ${l.toText ?? "?"}`}>
                    {l.conversationId && <Btn onClick={() => navigate(`/admin/new/chat/${l.conversationId}`)}>Reply</Btn>}
                  </Row>
                )}
              </Group>
              <Group title="Mark complete" hint="Move date has passed" items={complete} empty="Nothing to mark complete.">
                {(j) => (
                  <Row key={j.reference} onOpen={() => setOpen(j.reference)} who={j.customerName} meta={<>{j.movingDate && shortDay(j.movingDate)} · {aud(jobPrice(j))}</>}>
                    <Btn onClick={() => setOpen(j.reference)}>Record final amount</Btn>
                  </Row>
                )}
              </Group>
              <Group title="Follow up" hint="Priced, not booked yet" items={follow} empty="No open estimates or quotes.">
                {(j) => (
                  <Row key={j.reference} onOpen={() => setOpen(j.reference)} who={j.customerName} meta={<>{j.status === "quoted" ? "Quoted" : "Estimate"} {aud(jobPrice(j))}{j.validUntil && ` · valid until ${shortDay(j.validUntil)}`}</>}>
                    <Btn quiet onClick={() => setOpen(j.reference)}>Open</Btn>
                  </Row>
                )}
              </Group>
            </>
          )}
        </Panel>

        <div className="grid gap-5">
          <Road title="On the road today" day={today} trips={(cap.data?.dayTrips ?? []).filter((b) => b.status === "confirmed")} cap={cap.data} onOpen={(b) => byRef(b.quoteReference) && setOpen(b.quoteReference)} />
          <Road title="Tomorrow" day={addDays(today, 1)} trips={bookings.filter((b) => b.status === "confirmed" && b.date === addDays(today, 1))} cap={cap.data} onOpen={(b) => byRef(b.quoteReference) && setOpen(b.quoteReference)} />
        </div>
      </div>

      {openJob && <JobPanel job={openJob} role={role} onClose={() => setOpen(null)} onChanged={changed} />}
    </div>
  );
}

function Kpi({ label, value, sub, to }: { label: string; value: ReactNode; sub: string; to?: string }) {
  const body = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-display text-[26px] font-black leading-tight text-navy tabular-nums">{value}</span>
      <span className="text-xs text-slate-500">{sub}</span>
    </>
  );
  const cls = "grid gap-0.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm";
  return to ? (
    <Link to={to} className={clsx(cls, "hover:border-navy-3")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Group<T>({ title, hint, items, hot, empty, children }: { title: string; hint: string; items: T[]; hot?: boolean; empty: string; children: (item: T) => ReactNode }) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-1.5">
        <span className={clsx("grid h-6 min-w-6 place-items-center rounded-md px-1 font-display text-[13px] font-black", hot && items.length ? "bg-action text-white" : "bg-paper-2 text-navy")}>{items.length}</span>
        <h3 className="font-display text-sm font-extrabold text-navy">{title}</h3>
        <p className="ml-auto text-right text-xs text-slate-400">{hint}</p>
      </div>
      {items.length ? items.map(children) : <p className="px-4 pb-3 text-xs text-slate-400 sm:pl-[50px]">{empty}</p>}
    </div>
  );
}

function Row({ who, meta, onOpen, children }: { who: string; meta: ReactNode; onOpen?: () => void; children: ReactNode }) {
  return (
    <div className={clsx("grid gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:pl-[50px]", onOpen && "cursor-pointer hover:bg-paper")} onClick={onOpen}>
      <div className="min-w-0">
        <p className="font-bold text-navy">{who}</p>
        <p className="text-[12.5px] text-slate-600">{meta}</p>
      </div>
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Btn({ primary, quiet, onClick, children }: { primary?: boolean; quiet?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-bold",
        primary ? "bg-action text-white hover:bg-action-dim" : quiet ? "text-slate-500 hover:bg-paper-2" : "border border-slate-300 bg-white text-navy hover:border-navy",
      )}
    >
      {children}
    </button>
  );
}

function Road({ title, day, trips, cap, onOpen }: { title: string; day: string; trips: Booking[]; cap: ReturnType<typeof useCapacity>["data"]; onOpen: (b: Booking) => void }) {
  return (
    <Panel title={title} aside={<Link to="/admin/trips" className="text-xs font-semibold text-slate-500 hover:text-navy">{shortDay(day)} &rarr;</Link>}>
      <div className="grid gap-3 px-4 pb-4">
        {!cap && <p className="text-sm text-slate-500">Loading...</p>}
        {cap?.trucks.filter((t) => t.active).map((t) => {
          const mine = trips.filter((b) => b.truckId === t.id).sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
          return (
            <div key={t.id} className="grid gap-1.5">
              <p className="flex justify-between text-xs font-bold text-slate-500">
                <span>
                  {t.label} · {t.truckType}
                </span>
                {mine.length > 0 && <span>{mine.length} job{mine.length > 1 && "s"}</span>}
              </p>
              {mine.length ? (
                mine.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b)}
                    className={clsx("grid grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-md border-l-[3px] bg-paper px-2.5 py-2 text-left text-[12.5px] hover:bg-paper-2", b.driverName?.trim() ? "border-eco" : "border-red-500")}
                  >
                    <span className="tabular-nums">{time12(b.arrivalTime)}</span>
                    <span>
                      <b className="text-navy">{b.customerName ?? b.quoteReference ?? "Trip"}</b>
                      <br />
                      {b.fromText ?? "?"} &rarr; {b.toText ?? "?"}
                      <br />
                      {b.driverName?.trim() || <b className="text-red-600">No driver</b>}
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-400">Available all day</p>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
