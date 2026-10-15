import { useEffect, useState } from "react";
import { Link } from "react-router";
import { JobCard } from "./JobCard";
import { useAdminApi } from "./useAdminApi";
import { useJobs } from "./useJobs";

// Lead review: what needs someone now.
//  - Booking requests: customers who agreed to the booking terms in the chat or on the website
//    form. Review (change anything, with a note), confirm -- it goes in the calendar and the
//    customer gets their confirmed PDF quote.
//  - Waiting for a quote: requests the form or chat couldn't price. Edit & send the quote.
//  - Chats that need a person.

interface LeadRow {
  id: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  fromText: string | null;
  toText: string | null;
  quoteReference: string | null;
  notes: string | null;
  updatedAt: string;
  conversationId: string | null;
}

export default function Dashboard() {
  const { adminFetch } = useAdminApi();
  const { data, error: jobsError, reload } = useJobs();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((d) => setLeads(d.leads))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = (m: string) => {
    setNotice(m);
    reload();
  };
  const requests = data?.jobs.filter((j) => j.status === "booking_requested") ?? [];
  const waiting = data?.jobs.filter((j) => j.status === "waiting_for_quote") ?? [];

  return (
    <div>
      {notice && <p className="mb-6 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {jobsError && <p className="mb-6 text-sm text-red-600">{jobsError}</p>}

      <section className="mb-10">
        <h2 className="font-display text-2xl font-bold text-navy">Booking requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          Customers who agreed to book their estimate, in the chat or on the website form (final charges confirmed at the move-day inspection). Review the details -- change the amount or anything else
          and add a note the customer will see -- then confirm. It goes into the booking calendar and the customer is emailed their confirmed PDF quote.
        </p>
        {!data && !jobsError && <p className="mt-6 text-sm text-slate-500">Loading...</p>}
        {data && requests.length === 0 && <p className="mt-6 text-sm text-slate-500">No booking requests waiting.</p>}
        <ul className="mt-6 space-y-3">
          {requests.map((j) => (
            <JobCard key={j.reference} job={j} onChanged={changed} />
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-2xl font-bold text-navy">Waiting for a quote</h2>
        <p className="mt-1 text-sm text-slate-600">
          Requests from the website form and the chat that didn&apos;t get an instant price. Send the quote from here (it emails the PDF), or quote in Matt&apos;s Google Form with the request&apos;s
          reference in &quot;Website or chat reference&quot; -- either way it leaves this list.
        </p>
        {data && waiting.length === 0 && <p className="mt-6 text-sm text-slate-500">Nothing waiting right now.</p>}
        <ul className="mt-6 space-y-3">
          {waiting.map((j) => (
            <JobCard key={j.reference} job={j} onChanged={changed} />
          ))}
        </ul>
      </section>

      <h2 className="font-display text-2xl font-bold text-navy">Chats that need a person</h2>
      <p className="mt-1 text-sm text-slate-600">Hand-offs and call-back requests from the chat -- price questions, packing, or anywhere the assistant wasn&apos;t sure.</p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {leads === null && !error && <p className="mt-6 text-sm text-slate-500">Loading...</p>}
      {leads !== null && leads.length === 0 && <p className="mt-6 text-sm text-slate-500">Nothing waiting right now.</p>}

      <ul className="mt-6 space-y-3">
        {leads?.map((lead) => {
          const card = (
            <>
              <p className="font-display font-bold text-navy">{lead.customerName ?? "Unnamed enquiry"}</p>
              <p className="text-sm text-slate-600">
                {lead.fromText ?? "?"} &rarr; {lead.toText ?? "?"}
                {lead.quoteReference && ` · ${lead.quoteReference}`}
              </p>
              {lead.notes && <p className="mt-1 text-sm italic text-action">&quot;{lead.notes}&quot;</p>}
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
