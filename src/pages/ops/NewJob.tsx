import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { shortDay } from "../../lib/noticeTiming";
import { REASONS } from "../admin/JobCard";
import { useAdminApi } from "../admin/useAdminApi";
import { aud, type QuoteLines } from "../admin/useJobs";

// "+ New job": Matt's Google Form, inside the dashboard. It is the same form, so the existing
// flow is untouched -- Form -> Sheet -> Apps Script (PDF quote + email) -> /api/intake -> Neon --
// and the job shows on Requests once the script has run. Above it:
//  - Verify: the customer's email, with the same new/returning rule as the 10% first-booking
//    discount; the email is filled into the form.
//  - Quick estimate: the price from the chat's own engine (api/admin/estimate.ts). Fill form puts
//    the crew, hours, stairs, long carry and heavy items into the form BEFORE any discount; the
//    script applies the 10% once, on submit, and prices it with this same engine, so the PDF and
//    email match the estimate shown here.
// Full and limited users (Matt) both use it.

const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScIko_XzSeFU45OKGS_7q06KpQjlFFcAw7bMu5YsbJYHwoTqA/viewform";
/** The form's questions, for its pre-filled link (from the form's own page, 4 Nov 2026). */
const ENTRY = {
  email: "entry.210828043",
  rate: "entry.768809928",
  crew: "entry.850964164",
  hours: "entry.1163617568",
  callOut: "entry.1710521537",
  stairNeeded: "entry.211308173",
  stairFlights: "entry.1477655067",
  jobType: "entry.1621209559",
  pickup: "entry.159065990",
  delivery: "entry.2062334329",
  distance: "entry.1842772706",
  travelTime: "entry.1331153787",
  date: "entry.809526360",
  truck: "entry.1074521162",
  arrival: "entry.1461736391",
  homeSize: "entry.701112915",
  loadingStairs: "entry.1241414893",
  unloadingStairs: "entry.855243874",
  longCarry: "entry.1135679689",
  heavyItems: "entry.321794779",
} as const;

const SIZES = [
  { id: "studio_1bed", label: "Studio / 1 bed", truck: "4.5T" },
  { id: "2_bed", label: "2 bed", truck: "4.5T" },
  { id: "3_bed", label: "3 bed", truck: "6-8T" },
  { id: "4plus_bed", label: "4+ bed", truck: "10T" },
] as const;
/** The only crews each truck takes (Blue Line, 28 Oct). */
const CREWS = [
  { truck: "4.5T", movers: 2 },
  { truck: "6-8T", movers: 2 },
  { truck: "10T", movers: 3 },
] as const;

type Check = { customerType: "new" | "returning"; lastMove: { date: string | null; reference: string } | null; discountPercent: number };
type End = { apartment: boolean; stairs: string; parkingNear: boolean };
type Estimate =
  | { ok: true; total: number; lines: QuoteLines; roundingAud: number; hours: number; distanceKm: number; travelMinutes: number; longCarryEnds: number }
  | { ok: false; reason: string };

export function NewJobButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-3.5 py-2 text-sm font-bold text-white hover:bg-action-dim">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New job
      </button>
      {/* Drawn on <body>: inside the blurred top bar a fixed overlay is trapped in the bar. */}
      {open && createPortal(<NewJobPanel onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function NewJobPanel({ onClose }: { onClose: () => void }) {
  const { adminFetch } = useAdminApi();
  const [email, setEmail] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /** The form's pre-filled answers ({} = a blank form). */
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [loads, setLoads] = useState(0);

  const [move, setMove] = useState({ from: "", to: "", size: "2_bed" as (typeof SIZES)[number]["id"], crew: 0, date: "", arrival: "08:00", heavy: "0" });
  const [pickup, setPickup] = useState<End>({ apartment: false, stairs: "0", parkingNear: true });
  const [dropoff, setDropoff] = useState<End>({ apartment: false, stairs: "0", parkingNear: true });
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const fill = (answers: Record<string, string>) => {
    setPrefill(answers);
    setLoads(0);
  };

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setCheckError(null);
    setCheck(null);
    setEstimate(null); // the 10% preview depends on the answer
    try {
      const res = await adminFetch(`/api/admin/customer?email=${encodeURIComponent(email.trim())}`);
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't check that customer");
      setCheck(out as Check);
      fill({ ...prefill, [ENTRY.email]: email.trim() });
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Couldn't check that customer");
    } finally {
      setChecking(false);
    }
  }

  const crew = CREWS[move.crew]!;
  const newCustomer = check?.customerType === "new";
  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setEstimating(true);
    setEstimateError(null);
    setEstimate(null);
    const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));
    try {
      const res = await adminFetch("/api/admin/estimate", {
        method: "POST",
        body: JSON.stringify({
          from: move.from,
          to: move.to,
          propertySize: move.size,
          truck: crew.truck,
          movers: crew.movers,
          movingDate: move.date,
          pickupApartment: pickup.apartment,
          pickupStairFlights: n(pickup.stairs),
          pickupParkingOver50m: !pickup.apartment && !pickup.parkingNear,
          dropoffApartment: dropoff.apartment,
          dropoffStairFlights: n(dropoff.stairs),
          dropoffParkingOver50m: !dropoff.apartment && !dropoff.parkingNear,
          heavyItems: n(move.heavy),
          newCustomer,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't work out the estimate");
      setEstimate(out as Estimate);
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : "Couldn't work out the estimate");
    } finally {
      setEstimating(false);
    }
  }

  /** The estimate's answers into the form -- every price BEFORE discount; the script applies the 10%. */
  function fillForm() {
    if (!estimate?.ok) return;
    const l = estimate.lines;
    const flights = (l.stairFlights ?? 0).toString();
    fill({
      ...(email.trim() ? { [ENTRY.email]: email.trim() } : {}),
      [ENTRY.rate]: String(l.rateHr ?? ""),
      [ENTRY.crew]: `${crew.movers} movers`,
      [ENTRY.hours]: String(estimate.hours),
      [ENTRY.callOut]: "0",
      [ENTRY.stairNeeded]: l.stairFlights ? "Yes" : "No",
      [ENTRY.stairFlights]: flights,
      [ENTRY.jobType]: "Residential Moving",
      [ENTRY.pickup]: move.from,
      [ENTRY.delivery]: move.to,
      [ENTRY.distance]: `${estimate.distanceKm.toFixed(1)} km`,
      [ENTRY.travelTime]: `${Math.round(estimate.travelMinutes)} min`,
      [ENTRY.date]: move.date,
      [ENTRY.truck]: crew.truck,
      ...(move.arrival ? { [ENTRY.arrival]: move.arrival } : {}),
      [ENTRY.homeSize]: SIZES.find((s) => s.id === move.size)!.label,
      [ENTRY.loadingStairs]: String(Math.max(0, Math.round(Number(pickup.stairs) || 0))),
      [ENTRY.unloadingStairs]: String(Math.max(0, Math.round(Number(dropoff.stairs) || 0))),
      [ENTRY.longCarry]: String(estimate.longCarryEnds),
      [ENTRY.heavyItems]: String(l.heavyCount ?? 0),
    });
  }

  const query = Object.entries(prefill)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");
  const src = `${FORM}?embedded=true${query ? `&usp=pp_url${query}` : ""}`;
  const input = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-3 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="New job" className="flex h-full max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 pt-4 pb-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">New job</h2>
            <p className="text-sm text-slate-500">The quote form: the PDF quote is emailed as usual, and the job shows on Requests within a minute of submitting.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-paper">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <form onSubmit={verify} className="grid gap-2 border-b border-slate-200 bg-paper px-5 py-3">
            <label htmlFor="verify-email" className="text-xs font-semibold text-slate-500">
              Customer email <span className="font-normal text-slate-400">· check for the 10% first-booking discount, then it&apos;s filled into the form</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input id="verify-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" className={clsx(input, "flex-1")} />
              <button type="submit" disabled={checking} className="rounded-md bg-navy px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                {checking ? "Checking..." : "Verify"}
              </button>
            </div>
            {checkError && <p className="text-sm text-red-600">{checkError}</p>}
            {check && (
              <p className={clsx("rounded-md px-3 py-2 text-sm font-semibold", check.customerType === "new" ? "bg-eco-wash text-eco" : "bg-orange-50 text-action-dim")}>
                {check.customerType === "new"
                  ? `New customer: eligible for ${check.discountPercent}% discount`
                  : `Returning customer (last move ${check.lastMove?.date ? shortDay(check.lastMove.date) : (check.lastMove?.reference ?? "on record")}): not eligible for ${check.discountPercent}% discount`}
              </p>
            )}
          </form>

          <form onSubmit={calculate} className="grid gap-3 border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-base font-extrabold text-navy">Quick estimate</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Pick-up address">
                <input required className={input} value={move.from} onChange={(e) => setMove({ ...move, from: e.target.value })} placeholder="12 Bell St, Coburg VIC 3058" />
              </F>
              <F label="Drop-off address">
                <input required className={input} value={move.to} onChange={(e) => setMove({ ...move, to: e.target.value })} placeholder="30 Main Rd, Clayton VIC 3168" />
              </F>
              <F label="Home size">
                <select
                  className={input}
                  value={move.size}
                  onChange={(e) => {
                    const size = SIZES.find((s) => s.id === e.target.value)!;
                    setMove({ ...move, size: size.id, crew: CREWS.findIndex((c) => c.truck === size.truck) });
                  }}
                >
                  {SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Truck and movers" hint="set from the home size">
                <select className={input} value={move.crew} onChange={(e) => setMove({ ...move, crew: Number(e.target.value) })}>
                  {CREWS.map((c, i) => (
                    <option key={c.truck} value={i}>
                      {c.truck} truck, {c.movers} movers
                    </option>
                  ))}
                </select>
              </F>
              <F label="Move date">
                <input required type="date" className={input} value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} />
              </F>
              <F label="Arrival time">
                <input type="time" className={input} value={move.arrival} onChange={(e) => setMove({ ...move, arrival: e.target.value })} />
              </F>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <EndFields title="Pick-up" end={pickup} onChange={setPickup} input={input} />
              <EndFields title="Drop-off" end={dropoff} onChange={setDropoff} input={input} />
            </div>
            <F label="Heavy items" hint="pianos, safes, pool tables... a fridge or washing machine is not a heavy item">
              <input type="number" min={0} max={30} className={clsx(input, "sm:w-32")} value={move.heavy} onChange={(e) => setMove({ ...move, heavy: e.target.value })} />
            </F>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={estimating} className="rounded-md bg-navy px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                {estimating ? "Calculating..." : "Calculate"}
              </button>
              {estimate?.ok && (
                <button type="button" onClick={fillForm} className="rounded-md bg-action px-4 py-1.5 text-sm font-bold text-white hover:bg-action-dim">
                  Fill form
                </button>
              )}
              {!check && <span className="text-xs text-slate-400">Verify the email first to preview the 10%.</span>}
            </div>
            {estimateError && <p className="text-sm text-red-600">{estimateError}</p>}
            {estimate && !estimate.ok && (
              <p className="rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-action-dim">
                Needs a personal quote: {estimate.reason === "crew_not_allowed" ? "that truck doesn't take that crew" : (REASONS[estimate.reason] ?? estimate.reason)}
              </p>
            )}
            {estimate?.ok && <EstimateLines estimate={estimate} />}
          </form>

          {loads > 1 && <p className="border-b border-green-200 bg-green-50 px-5 py-2 text-sm text-green-800">Submitted. The job shows on Requests within a minute, once the quote has been made.</p>}
          <iframe key={src} src={src} title="BLR quote form" onLoad={() => setLoads((n) => n + 1)} className="h-[80vh] w-full border-0">
            Loading...
          </iframe>
        </div>
        <p className="border-t border-slate-200 px-5 py-2 text-xs text-slate-500">
          Form not loading?{" "}
          <a href={src.replace("embedded=true", "")} target="_blank" rel="noreferrer" className="font-semibold text-navy underline">
            Open it in a new tab
          </a>
        </p>
      </div>
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-1 text-xs font-semibold text-slate-500">
      <span>
        {label}
        {hint && <span className="font-normal text-slate-400"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function EndFields({ title, end, onChange, input }: { title: string; end: End; onChange: (e: End) => void; input: string }) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-bold text-navy">{title}</legend>
      <div className="flex gap-2 text-sm">
        {[false, true].map((apartment) => (
          <label key={String(apartment)} className={clsx("cursor-pointer rounded-md border px-2.5 py-1 font-semibold", end.apartment === apartment ? "border-navy bg-navy text-white" : "border-slate-300 text-slate-600")}>
            <input type="radio" className="sr-only" checked={end.apartment === apartment} onChange={() => onChange({ ...end, apartment })} />
            {apartment ? "Apartment" : "House"}
          </label>
        ))}
      </div>
      <F label="Stairs" hint="flights, no lift">
        <input type="number" min={0} max={20} className={input} value={end.stairs} onChange={(e) => onChange({ ...end, stairs: e.target.value })} />
      </F>
      {end.apartment ? (
        <p className="text-xs text-slate-400">Apartments always have the long carry.</p>
      ) : (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={end.parkingNear} onChange={(e) => onChange({ ...end, parkingNear: e.target.checked })} />
          Truck parks within 50 m of the door
        </label>
      )}
    </fieldset>
  );
}

/** The estimate the way the customer's quote PDF shows it. */
function EstimateLines({ estimate }: { estimate: Extract<Estimate, { ok: true }> }) {
  const l = estimate.lines;
  const per = (total: number, n: number) => aud(Math.round((total / n) * 100) / 100);
  const rows: [string, string, number][] = [
    ["Moving Labour", `${l.hours ?? ""} h × ${aud(l.rateHr ?? 0)}`, l.labour],
    ...(l.stair ? ([["Stair Carry Fee", `${l.stairFlights} × ${per(l.stair, l.stairFlights || 1)}`, l.stair]] as [string, string, number][]) : []),
    ...(l.longCarry ? ([["Long Carry Fee", `${l.longCarryEnds} × ${per(l.longCarry, l.longCarryEnds || 1)}`, l.longCarry]] as [string, string, number][]) : []),
    ...(l.heavy ? ([["Heavy Items", `${l.heavyCount} × ${per(l.heavy, l.heavyCount || 1)}`, l.heavy]] as [string, string, number][]) : []),
    ...(l.discount ? ([[`New customer discount (${l.discountPercent ?? 10}%)`, "", -l.discount]] as [string, string, number][]) : []),
  ];
  const money = (n: number) => (n < 0 ? `−${aud(-n)}` : aud(n));
  return (
    <div className="grid gap-2">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, rate, amount]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="py-1.5 pr-2">{label}</td>
              <td className="py-1.5 pr-2 text-slate-500 tabular-nums">{rate}</td>
              <td className={clsx("py-1.5 text-right tabular-nums", amount < 0 && "text-eco")}>{money(amount)}</td>
            </tr>
          ))}
          <tr className="border-b border-slate-100">
            <td className="py-1.5" colSpan={2}>
              Subtotal
            </td>
            <td className="py-1.5 text-right tabular-nums">{aud(l.subtotal)}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5" colSpan={2}>
              GST (10%)
            </td>
            <td className="py-1.5 text-right tabular-nums">{aud(l.gst)}</td>
          </tr>
          <tr>
            <td className="pt-2 font-display text-base font-extrabold text-navy" colSpan={2}>
              Estimated total
            </td>
            <td className="pt-2 text-right font-display text-base font-extrabold text-navy tabular-nums">{aud(estimate.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-400">
        {estimate.roundingAud ? `Rounded to the nearest $10: ${estimate.roundingAud > 0 ? "+" : "−"}${aud(Math.abs(estimate.roundingAud))}, included in Moving Labour. ` : ""}
        Drive between the addresses: {estimate.distanceKm.toFixed(1)} km, {Math.round(estimate.travelMinutes)} min (in the hours).
      </p>
      <p className="rounded-md bg-paper px-3 py-2 text-xs font-semibold text-slate-600">Prices go into the form before discount. The 10% is applied automatically when you submit.</p>
    </div>
  );
}
