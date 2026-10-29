import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import { CHANNEL_LABEL } from "../../server/jobs/status";
import { TRUCK_TYPES, useCapacity } from "../admin/capacityShared";
import { useAdminApi } from "../admin/useAdminApi";
import { useAdminRole } from "../admin/useAdminRole";

// "+ New job": a phone, Airtasker, Moval or other job in one form -- it replaces "Assign a truck
// to a trip" and "Add a booking by hand". Saved through api/adminjob.ts like Matt's Google
// Form, so it shows on every list with a status. Matt (limited) can only book.

const CHANNELS = ["phone", "airtasker", "moval", "website_followup", "other"] as const;
/** Crew per truck (Blue Line, 28 Oct): 2 on the 4.5T and 6-8T, 3 on the 10T. */
const CREW: Record<string, number> = { "4.5T": 2, "6-8T": 2, "10T": 3 };

export function NewJobButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-1.5 rounded-md bg-action px-3 py-2 text-sm font-bold text-white hover:bg-action-dim">
        <span aria-hidden="true">+</span> New job
      </button>
      {open && <NewJobForm onClose={() => setOpen(false)} />}
    </>
  );
}

function NewJobForm({ onClose }: { onClose: () => void }) {
  const role = useAdminRole();
  const navigate = useNavigate();
  const { adminFetch } = useAdminApi();
  const cap = useCapacity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    mode: role === "full" ? "quote" : "book",
    channel: "phone",
    need: "moving",
    customerName: "",
    phone: "",
    email: "",
    fromText: "",
    toText: "",
    jobDescription: "",
    platformJobNumber: "",
    movingDate: "",
    arrivalTime: "08:00",
    truck: "4.5T",
    movers: "2",
    hours: "3",
    totalAud: "",
    truckId: "",
    driverId: "",
    notifyCustomer: true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const book = f.mode === "book";
  const trucks = cap.data?.trucks.filter((t) => t.active && t.id && t.truckType === f.truck) ?? [];

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  // A truck of the chosen size, preselected.
  const firstTruck = trucks[0]?.id ?? "";
  const truckFits = trucks.some((t) => t.id === f.truckId);
  useEffect(() => {
    if (!truckFits && f.truckId !== firstTruck) setF((x) => ({ ...x, truckId: firstTruck }));
  }, [truckFits, firstTruck, f.truckId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const val = (v: string) => v.trim() || null;
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const res = await adminFetch("/api/adminjob", {
        method: "POST",
        body: JSON.stringify({
          mode: f.mode,
          channel: f.channel,
          need: f.need,
          customerName: f.customerName,
          phone: f.phone,
          email: f.email.trim(),
          fromText: val(f.fromText),
          toText: val(f.toText),
          jobDescription: val(f.jobDescription),
          platformJobNumber: val(f.platformJobNumber),
          movingDate: val(f.movingDate),
          arrivalTime: book ? val(f.arrivalTime) : null,
          truck: book ? f.truck : null,
          movers: book ? n(f.movers) : null,
          hours: book ? n(f.hours) : null,
          totalAud: book ? n(f.totalAud) : null,
          truckId: book ? val(f.truckId) : null,
          driverId: book ? val(f.driverId) : null,
          notifyCustomer: f.notifyCustomer,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't save the job");
      const notice = [book ? "Job booked." : "Job saved. Send the quote below.", out.warning, ...(out.notices ?? [])].filter(Boolean).join(" ");
      onClose();
      navigate(`/admin/jobs/${out.reference}`, { state: { notice } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the job");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-ink";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="New job" onSubmit={save} className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="px-5 pt-5 pb-2">
          <h2 className="font-display text-xl font-extrabold text-navy">New job</h2>
          <p className="text-sm text-slate-500">For a job that didn&apos;t come through the website or the chat.</p>
        </div>
        <div className="grid gap-4 px-5 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Came from">
              <select className={input} value={f.channel} onChange={set("channel")}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </F>
            <F label="Type of job">
              <select className={input} value={f.need} onChange={set("need")}>
                <option value="moving">Move</option>
                <option value="junk">Junk removal</option>
              </select>
            </F>
            <F label="Customer name">
              <input required className={input} value={f.customerName} onChange={set("customerName")} />
            </F>
            <F label="Phone">
              <input required type="tel" className={input} value={f.phone} onChange={set("phone")} />
            </F>
            <F label="Email" hint="Needed to email the quote or booking">
              <input type="email" className={input} value={f.email} onChange={set("email")} />
            </F>
            <F label="Platform job number" hint="Airtasker or Moval, if any">
              <input className={input} value={f.platformJobNumber} onChange={set("platformJobNumber")} />
            </F>
            <F label="Pick-up address">
              <input className={input} value={f.fromText} onChange={set("fromText")} />
            </F>
            <F label="Drop-off address">
              <input className={input} value={f.toText} onChange={set("toText")} />
            </F>
            <F label="About the job" hint="Home size, heavy items, stairs..." wide>
              <textarea rows={2} className={input} value={f.jobDescription} onChange={set("jobDescription")} />
            </F>
          </div>

          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-xs font-semibold text-slate-500">What next?</legend>
            {role === "full" && <Choice checked={!book} onChange={() => setF({ ...f, mode: "quote" })} title="Needs a quote" text="Save it, then send the quote from the job page" />}
            <Choice checked={book} onChange={() => setF({ ...f, mode: "book" })} title="Book it now" text="The customer already said yes" />
          </fieldset>

          {book && (
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="Moving date">
                <input required type="date" className={input} value={f.movingDate} onChange={set("movingDate")} />
              </F>
              <F label="Arrive">
                <input required type="time" className={input} value={f.arrivalTime} onChange={set("arrivalTime")} />
              </F>
              <F label="Truck size">
                <select className={input} value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value, movers: String(CREW[e.target.value] ?? 2) })}>
                  {TRUCK_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </F>
              <F label="Movers">
                <input required type="number" min={1} max={10} className={input} value={f.movers} onChange={set("movers")} />
              </F>
              <F label="Hours (about)">
                <input required type="number" min={0.5} max={16} step={0.5} className={input} value={f.hours} onChange={set("hours")} />
              </F>
              <F label="Total $ inc GST" hint="Blank = the price list">
                <input type="number" min={0} className={input} value={f.totalAud} onChange={set("totalAud")} />
              </F>
              <F label="Truck">
                <select required className={input} value={f.truckId} onChange={set("truckId")}>
                  {trucks.length === 0 && <option value="">{cap.data ? `No ${f.truck} truck` : "Loading..."}</option>}
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Driver">
                <select className={input} value={f.driverId} onChange={set("driverId")}>
                  <option value="">Pick later</option>
                  {cap.data?.drivers.filter((d) => d.active && d.id).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </F>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600">
                <input type="checkbox" checked={f.notifyCustomer} onChange={(e) => setF({ ...f, notifyCustomer: e.target.checked })} />
                Email the customer their booking
              </label>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pt-2 pb-5">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-paper">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-md bg-action px-4 py-1.5 text-sm font-bold text-white hover:bg-action-dim disabled:opacity-50">
            {busy ? "Saving..." : book ? "Book job" : "Save job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function F({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={clsx("grid content-start gap-1 text-xs font-semibold text-slate-500", wide && "sm:col-span-2")}>
      <span>
        {label}
        {hint && <span className="font-normal text-slate-400"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Choice({ checked, onChange, title, text }: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className={clsx("grid cursor-pointer gap-0.5 rounded-lg border p-2.5 text-xs text-slate-500", checked ? "border-action bg-orange-50" : "border-slate-200")}>
      <span className="flex items-center gap-2 text-sm font-bold text-navy">
        <input type="radio" checked={checked} onChange={onChange} />
        {title}
      </span>
      {text}
    </label>
  );
}
