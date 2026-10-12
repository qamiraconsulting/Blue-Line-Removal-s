import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAdminApi } from "./useAdminApi";

interface QuoteRow {
  reference: string;
  createdAt: string;
  source: string;
  conversationId: string | null;
  status: string;
  manualReason: string | null;
  customerName: string;
  phone: string;
  email: string;
  need: string;
  truck: string | null;
  movers: number | null;
  accessNotes: string | null;
  movingDate: string | null;
  fromText: string | null;
  toText: string | null;
  amountAud: number | null;
}

// Why a quote didn't get an instant price, in words for Blue Line staff.
const REASONS: Record<string, string> = {
  junk_removal: "Junk removal",
  size_missing: "No home size given",
  commercial_or_unsure_size: "Office move or unsure home size",
  special_items: "Specialist items (piano, safe...)",
  date_missing: "No valid moving date",
  distance_unavailable: "Couldn't work out the distance",
  outside_service_area: "Outside the service area",
  rate_card_not_confirmed: "Price list not signed off yet",
  rate_card_incomplete: "Price list incomplete for this job",
  service_unavailable: "Quote system unavailable",
};

const capacity = (q: QuoteRow) =>
  q.truck === "inspect" ? "Inspection" : q.truck ? `${q.truck}${q.movers ? `, ${q.movers} movers` : ""}` : null;

export function QuotesPanel() {
  const { adminFetch } = useAdminApi();
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/quotes?status=manual_review&limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => setQuotes(data.quotes))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold text-navy">Waiting for a personal quote</h2>
      <p className="mt-1 text-sm text-slate-600">Quote requests from the website form and the chat that didn&apos;t get an instant price.</p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {quotes === null && !error && <p className="mt-6 text-sm text-slate-500">Loading...</p>}
      {quotes !== null && quotes.length === 0 && <p className="mt-6 text-sm text-slate-500">Nothing waiting right now.</p>}

      <ul className="mt-6 space-y-3">
        {quotes?.map((q) => (
          <li key={q.reference} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display font-bold text-navy">{q.customerName}</p>
              <p className="text-xs text-slate-400">
                {q.reference} &middot; {q.source === "chatbot" ? "chat" : "form"} &middot; {new Date(q.createdAt).toLocaleString("en-AU")}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {q.phone} &middot; {q.email}
            </p>
            <p className="text-sm text-slate-600">
              {q.need === "junk" ? "Junk removal" : `${q.fromText ?? "?"} → ${q.toText ?? "?"}`}
              {q.movingDate && ` · ${q.movingDate}`}
              {capacity(q) && ` · ${capacity(q)}`}
            </p>
            {q.accessNotes && <p className="mt-1 text-sm text-slate-600">Access: {q.accessNotes}</p>}
            <p className="mt-1 text-sm font-bold text-action">{REASONS[q.manualReason ?? ""] ?? q.manualReason ?? "Needs review"}</p>
            {q.conversationId && (
              <Link to={`/admin/conversations/${q.conversationId}`} className="mt-1 inline-block text-sm text-navy underline">
                Open the chat
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
