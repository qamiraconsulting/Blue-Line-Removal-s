import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAdminApi } from "./useAdminApi";

interface LeadRow {
  id: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  pickupAddressFormatted: string | null;
  destinationAddressFormatted: string | null;
  notes: string | null;
  updatedAt: string;
  conversationId: string | null;
}

export default function Dashboard() {
  const { adminFetch } = useAdminApi();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => setLeads(data.leads))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-navy">Needs follow-up</h2>
      <p className="mt-1 text-sm text-slate-600">Leads the chat assistant escalated -- pianos, price pushback, or anywhere it wasn't sure.</p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {leads === null && !error && <p className="mt-6 text-sm text-slate-500">Loading...</p>}
      {leads !== null && leads.length === 0 && <p className="mt-6 text-sm text-slate-500">Nothing waiting right now.</p>}

      <ul className="mt-6 space-y-3">
        {leads?.map((lead) => {
          const card = (
            <>
              <p className="font-display font-bold text-navy">{lead.customerName ?? "Unnamed enquiry"}</p>
              <p className="text-sm text-slate-600">
                {lead.pickupAddressFormatted ?? "?"} &rarr; {lead.destinationAddressFormatted ?? "?"}
              </p>
              {lead.notes && <p className="mt-1 text-sm italic text-action">"{lead.notes}"</p>}
              <p className="mt-2 text-xs text-slate-400">{new Date(lead.updatedAt).toLocaleString("en-AU")}</p>
            </>
          );
          return (
            <li key={lead.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {lead.conversationId ? (
                <Link to={`/admin/conversations/${lead.conversationId}`} className="block">
                  {card}
                </Link>
              ) : (
                <div className="opacity-60">{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
