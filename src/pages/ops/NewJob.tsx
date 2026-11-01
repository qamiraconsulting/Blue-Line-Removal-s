import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { shortDay } from "../../lib/noticeTiming";
import { useAdminApi } from "../admin/useAdminApi";

// "+ New job": Matt's Google Form, inside the dashboard. It is the same form, so the existing
// flow is untouched -- Form -> Sheet -> Apps Script (PDF quote + email) -> /api/intake -> Neon --
// and the job shows on Requests once the script has run. Above it, Verify checks the customer's
// email with the same new/returning rule as the 10% first-booking discount and pre-fills the
// email into the form. Full and limited users (Matt) both use it.

const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScIko_XzSeFU45OKGS_7q06KpQjlFFcAw7bMu5YsbJYHwoTqA/viewform";
/** The form's "Customer Email :" question, for its pre-filled link. */
const EMAIL_ENTRY = "entry.210828043";

type Check = { customerType: "new" | "returning"; lastMove: { date: string | null; reference: string } | null; discountPercent: number };

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
  const [prefill, setPrefill] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCheck(null);
    try {
      const res = await adminFetch(`/api/admin/customer?email=${encodeURIComponent(email.trim())}`);
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Couldn't check that customer");
      setCheck(out as Check);
      setPrefill(email.trim());
      setLoads(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check that customer");
    } finally {
      setBusy(false);
    }
  }

  const src = `${FORM}?embedded=true${prefill ? `&usp=pp_url&${EMAIL_ENTRY}=${encodeURIComponent(prefill)}` : ""}`;
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

        <form onSubmit={verify} className="grid gap-2 border-b border-slate-200 bg-paper px-5 py-3">
          <label htmlFor="verify-email" className="text-xs font-semibold text-slate-500">
            Customer email <span className="font-normal text-slate-400">· check for the 10% first-booking discount, then it&apos;s filled into the form</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="verify-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            />
            <button type="submit" disabled={busy} className="rounded-md bg-navy px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Checking..." : "Verify"}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {check && (
            <p className={clsx("rounded-md px-3 py-2 text-sm font-semibold", check.customerType === "new" ? "bg-eco-wash text-eco" : "bg-orange-50 text-action-dim")}>
              {check.customerType === "new"
                ? `New customer: eligible for ${check.discountPercent}% discount`
                : `Returning customer (last move ${check.lastMove?.date ? shortDay(check.lastMove.date) : (check.lastMove?.reference ?? "on record")}): not eligible for ${check.discountPercent}% discount`}
            </p>
          )}
        </form>

        {loads > 1 && (
          <p className="border-b border-green-200 bg-green-50 px-5 py-2 text-sm text-green-800">Submitted. The job shows on Requests within a minute, once the quote has been made.</p>
        )}
        <iframe key={src} src={src} title="BLR quote form" onLoad={() => setLoads((n) => n + 1)} className="min-h-0 w-full flex-1 border-0">
          Loading...
        </iframe>
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
