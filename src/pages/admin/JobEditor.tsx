import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdminApi } from "./useAdminApi";
import { aud, type Job, type QuoteLines } from "./useJobs";

// "Review & confirm" / "Edit & send quote": the team checks the job, changes anything that's
// different (date, time, addresses, truck, crew, hours, stairs, packing -- the price works
// itself out again from the price list), or types their own total, adds a note the customer
// will see, then sends. The live breakdown is what goes on the customer's PDF.

const TRUCKS = ["4.5T", "6-8T", "10T"];
const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-action focus:outline-none";

interface Form {
  movingDate: string;
  arrivalTime: string;
  fromText: string;
  toText: string;
  truck: string;
  movers: string;
  hours: string;
  stairFlights: string;
  packingAud: string;
  services: string;
  overrideTotal: string;
  note: string;
}

function initialForm(job: Job): Form {
  const l = job.lines;
  return {
    movingDate: job.movingDate ?? "",
    arrivalTime: job.arrivalTime ?? "",
    fromText: job.fromText ?? "",
    toText: job.toText ?? "",
    truck: l?.truck ?? "",
    movers: l?.movers ? String(l.movers) : "",
    hours: l?.hours ? String(l.hours) : "",
    stairFlights: String(l?.stairFlights ?? 0),
    packingAud: String(l?.packing ?? 0),
    services: l?.services ?? "Standard Move",
    overrideTotal: "",
    note: "",
  };
}

/** Only what the team actually changed -- unchanged price fields keep the estimate as it was. */
function editsFrom(form: Form, start: Form) {
  const e: Record<string, unknown> = {};
  const changed = (k: keyof Form) => form[k] !== start[k];
  if (changed("movingDate")) e.movingDate = form.movingDate || null;
  if (changed("arrivalTime")) e.arrivalTime = form.arrivalTime || null;
  if (changed("fromText")) e.fromText = form.fromText;
  if (changed("toText")) e.toText = form.toText;
  if (changed("truck")) e.truck = form.truck || null;
  if (changed("movers")) e.movers = form.movers ? Number(form.movers) : null;
  if (changed("hours")) e.hours = form.hours ? Number(form.hours) : null;
  if (changed("stairFlights")) e.stairFlights = Number(form.stairFlights) || 0;
  if (changed("packingAud")) e.packingAud = Number(form.packingAud) || 0;
  if (changed("services")) e.services = form.services;
  if (form.overrideTotal.trim()) e.overrideTotal = Math.round(Number(form.overrideTotal));
  if (form.note.trim()) e.note = form.note.trim();
  return e;
}

export function JobEditor({ job, mode, onDone, onCancel }: { job: Job; mode: "confirm" | "sendQuote"; onDone: (message: string) => void; onCancel: () => void }) {
  const { adminFetch } = useAdminApi();
  const start = useMemo(() => initialForm(job), [job]);
  const [form, setForm] = useState<Form>(start);
  // Matt's own jobs were already emailed by his Google Form -- don't email them again by default.
  const [notify, setNotify] = useState(job.source !== "team_form");
  const [preview, setPreview] = useState<{ lines?: QuoteLines; error?: string } | null>(job.lines ? { lines: job.lines } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edits = editsFrom(form, start);
  const editsKey = JSON.stringify(edits);
  const priceTouched = ["truck", "movers", "hours", "stairFlights", "packingAud", "overrideTotal", "services"].some((k) => k in edits);

  // Live breakdown from the server (the rates never come to the browser).
  useEffect(() => {
    if (!priceTouched) {
      setPreview(job.lines ? { lines: job.lines } : null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      adminFetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ action: "preview", reference: job.reference, edits }) })
        .then(async (res) => {
          const body = await res.json();
          setPreview(res.ok ? { lines: body.lines } : { error: body.error ?? "Can't work that out" });
        })
        .catch(() => setPreview({ error: "Can't work that out just now" }));
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editsKey]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ action: mode, reference: job.reference, edits, notifyCustomer: notify }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "That didn't work");
      const how = out.emailed ? (out.via === "pdf" ? " -- PDF quote emailed" : " -- emailed (plain email: the PDF couldn't be made)") : notify ? " -- NOT emailed (test figures, or email failed)" : "";
      const warn = out.capacityWarning ? ` Note: the calendar didn't show room (${String(out.capacityWarning).replace(/_/g, " ")}) -- check Bookings & capacity.` : "";
      const driver = out.driverMessage ? ` ${out.driverMessage}` : "";
      onDone(`${job.reference} ${mode === "confirm" ? "booked" : "quoted"} at ${aud(out.total)}${how}.${warn}${driver}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const l = preview?.lines;
  const changedPrice = l && job.lines && l.total !== job.lines.total;

  return (
    <div className="mt-3 rounded-lg border border-action/30 bg-orange-50/40 p-4">
      <p className="font-display font-bold text-navy">{mode === "confirm" ? "Review & confirm the booking" : "Edit & send the quote"}</p>
      <p className="mt-1 text-xs text-slate-600">Change anything that's different. The price works itself out again from the price list -- or type your own total. Leave the rest as it is.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Lbl text="Moving date">
          <input type="date" className={input} value={form.movingDate} onChange={set("movingDate")} />
        </Lbl>
        <Lbl text={mode === "confirm" ? "Arrival time (needed)" : "Arrival time"}>
          <input type="time" className={input} value={form.arrivalTime} onChange={set("arrivalTime")} />
        </Lbl>
        <Lbl text="From" className="sm:col-span-2">
          <input className={input} value={form.fromText} onChange={set("fromText")} />
        </Lbl>
        <Lbl text="To" className="sm:col-span-2">
          <input className={input} value={form.toText} onChange={set("toText")} />
        </Lbl>
        <Lbl text="Services">
          <input className={input} value={form.services} onChange={set("services")} />
        </Lbl>
        <Lbl text="Truck">
          <select className={input} value={form.truck} onChange={set("truck")}>
            <option value="">--</option>
            {TRUCKS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Lbl>
        <Lbl text="Movers">
          <input type="number" min={1} max={10} className={input} value={form.movers} onChange={set("movers")} />
        </Lbl>
        <Lbl text="Hours">
          <input type="number" min={0.5} max={24} step={0.5} className={input} value={form.hours} onChange={set("hours")} />
        </Lbl>
        <Lbl text="Stair flights">
          <input type="number" min={0} max={30} className={input} value={form.stairFlights} onChange={set("stairFlights")} />
        </Lbl>
        <Lbl text="Packing materials ($)">
          <input type="number" min={0} className={input} value={form.packingAud} onChange={set("packingAud")} />
        </Lbl>
        <Lbl text="Your own total, GST incl. ($)" className="sm:col-span-2">
          <input type="number" min={1} className={input} value={form.overrideTotal} onChange={set("overrideTotal")} placeholder="leave blank to use the calculated total" />
        </Lbl>
        <Lbl text="Note to the customer (shown with their quote)" className="sm:col-span-4">
          <textarea rows={2} maxLength={1000} className={input} value={form.note} onChange={set("note")} placeholder={changedPrice ? "Recommended: explain why the price changed" : "Optional"} />
        </Lbl>
      </div>

      <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">On the customer's quote</p>
        {preview?.error && <p className="text-red-600">{preview.error}</p>}
        {!l && !preview?.error && <p className="text-slate-500">Enter the truck, movers and hours, or your own total.</p>}
        {l && (
          <table className="w-full max-w-md">
            <tbody>
              {(
                [
                  [l.rateHr !== null && l.hours !== null ? `Labour (${l.hours} h x ${aud(l.rateHr)})` : "Labour", l.labour],
                  ["Call-out", l.callOut],
                  ["Packing materials", l.packing],
                  [`Stairs (${l.stairFlights} flights)`, l.stair],
                  ["Discount / adjustment", l.adjustment],
                  ["Subtotal (excl. GST)", l.subtotal],
                  ["GST", l.gst],
                ] as [string, number][]
              ).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pr-4 text-slate-600">{k}</td>
                  <td className="py-0.5 text-right tabular-nums">{v.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold text-navy">
                <td className="pt-1 pr-4">Total (GST incl.)</td>
                <td className="pt-1 text-right tabular-nums">{l.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {changedPrice && <p className="mt-1 text-xs text-action">Changed from {aud(job.lines!.total)}.</p>}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email the customer their {mode === "confirm" ? "confirmed " : ""}PDF quote
        {job.source === "team_form" && <span className="text-xs text-slate-500">(Matt's form already emailed this customer)</span>}
      </label>
      {job.testMode && <p className="mt-1 text-xs text-slate-500">Test figures: the email only goes to the preview's test inbox, if one is set.</p>}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button type="button" disabled={busy || !l} onClick={() => void submit()} className="rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40">
          {busy ? "Working..." : mode === "confirm" ? "Confirm booking" : "Send quote"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-600 underline">
          Close
        </button>
      </div>
    </div>
  );
}

function Lbl({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-xs font-bold text-slate-600 ${className ?? ""}`}>
      {text}
      {children}
    </label>
  );
}
