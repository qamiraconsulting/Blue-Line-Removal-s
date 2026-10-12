import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAdminApi } from "./useAdminApi";

interface BookingRow {
  reference: string;
  conversationId: string | null;
  customerName: string;
  phone: string;
  email: string;
  truck: string | null;
  movers: number | null;
  movingDate: string | null;
  fromText: string | null;
  toText: string | null;
  amountAud: number | null;
  rateCardStatus: string;
  bookingRequestedAt: string | null;
  bookingNotes: string | null;
}

// Customers who agreed in the chat to book on their estimate (final charges confirmed at the
// move-day inspection). Confirming emails the customer that their move is booked.
export function BookingsPanel() {
  const { adminFetch } = useAdminApi();
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    adminFetch("/api/admin/quotes?booking=requested&limit=100")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => setRows(data.quotes))
      .catch((err) => setError(err.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function confirm(reference: string) {
    setBusy(reference);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/booking", { method: "POST", body: JSON.stringify({ reference }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to confirm");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl font-bold text-navy">Booking requests</h2>
      <p className="mt-1 text-sm text-slate-600">
        Customers who agreed in the chat to book on their estimate, with the final charges confirmed at the move-day inspection. Check the date works, then confirm -- the customer is emailed.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {rows === null && !error && <p className="mt-6 text-sm text-slate-500">Loading...</p>}
      {rows !== null && rows.length === 0 && <p className="mt-6 text-sm text-slate-500">No booking requests waiting.</p>}

      <ul className="mt-6 space-y-3">
        {rows?.map((b) => (
          <li key={b.reference} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display font-bold text-navy">
                {b.customerName} &middot; {b.movingDate ?? "date tbc"}
              </p>
              <p className="text-xs text-slate-400">
                {b.reference}
                {b.rateCardStatus !== "confirmed" && " · TEST"}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {b.phone} &middot; {b.email}
            </p>
            <p className="text-sm text-slate-600">
              {b.fromText ?? "?"} &rarr; {b.toText ?? "?"} &middot; estimate ${b.amountAud?.toLocaleString("en-AU")}
              {b.truck && ` · ${b.truck === "inspect" ? "capacity at inspection" : `${b.truck}${b.movers ? `, ${b.movers} movers` : ""}`}`}
            </p>
            {b.bookingNotes && <p className="mt-1 text-sm text-slate-600">Notes: {b.bookingNotes}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy === b.reference}
                onClick={() => void confirm(b.reference)}
                className="rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Confirm booking
              </button>
              {b.conversationId && (
                <Link to={`/admin/conversations/${b.conversationId}`} className="text-sm text-navy underline">
                  Open the chat
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
