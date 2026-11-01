import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

// Where Stripe sends a customer back after the booking deposit page (src/server/payments):
//   /deposit?status=paid&ref=...       paid (card at once; a bank payment can take a minute)
//   /deposit?status=cancelled&ref=...  they went back without paying
//   /deposit?status=demo&ref=...       the DEMO payment page used until Stripe is connected
//   /deposit?status=demo_paid&ref=...  where the demo page's pretend "Pay" button goes
// The demo pages take no money and confirm nothing (src/server/payments/demoLink.ts).
// The booking itself is confirmed by Stripe's message to /api/stripe/webhook, never by this
// page -- anyone can open this URL, so it only says what happens next.

export function Deposit() {
  // Read on the client: the page is prerendered once, without the query string.
  const [params, setParams] = useState<{ status: string; ref: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("status");
    const status = raw === "paid" || raw === "demo" || raw === "demo_paid" ? raw : "cancelled";
    setParams({ status, ref: (q.get("ref") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) });
    if (status === "paid") trackEvent("deposit_paid_page");
  }, []);

  const callUs = (
    <a href={site.phone.href} className="font-bold text-action hover:underline">
      {site.phone.display}
    </a>
  );

  return (
    <Section tone="paper" className="pt-32 sm:pt-40">
      {/* A private after-payment page: keep it out of search results. */}
      <meta name="robots" content="noindex" />
      <Container>
        <div className="mx-auto max-w-xl rounded-lg border border-ink/10 bg-white p-6 text-center sm:p-8">
          {params === null ? (
            <p className="text-ink-dim">Loading...</p>
          ) : params.status === "demo" ? (
            <>
              <p className="mx-auto inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">Demo payment page</p>
              <h1 className="mt-4 text-2xl sm:text-3xl">Pay your $100 deposit</h1>
              <p className="mt-4 text-ink">
                This is a practice page while our online payments are being set up. <strong>No money is taken</strong> and your booking is not confirmed by it.
              </p>
              <p className="mt-3 text-sm text-ink-dim">The real page will let you pay by card, or straight from your bank account.</p>
              <a
                href={`/deposit?status=demo_paid&ref=${encodeURIComponent(params.ref)}`}
                className="mt-6 inline-flex items-center rounded-full bg-action px-6 py-3 font-bold text-white hover:opacity-90"
              >
                Pay $100 deposit (demo)
              </a>
            </>
          ) : params.status === "demo_paid" ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-eco" aria-hidden="true" />
              <p className="mx-auto mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">Demo</p>
              <h1 className="mt-4 text-2xl sm:text-3xl">That is how it will look</h1>
              <p className="mt-4 text-ink">
                No payment was taken and nothing was confirmed. Once online payments are connected, paying here confirms your booking automatically and we email you the details.
              </p>
            </>
          ) : params.status === "paid" ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-eco" aria-hidden="true" />
              <h1 className="mt-4 text-2xl sm:text-3xl">Thanks for your deposit</h1>
              <p className="mt-4 text-ink">
                We&apos;re confirming your booking now. You&apos;ll get a confirmation email in the next few minutes. If you paid from your bank
                account, it can take a minute or two to come through.
              </p>
              <p className="mt-3 text-sm text-ink-dim">If your arrival time has been taken in the meantime, one of our team will call you to sort out another time.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl">No payment was taken</h1>
              <p className="mt-4 text-ink">
                Your booking request is still with us, but it isn&apos;t locked in until the $100 deposit is paid. You can use the payment link in
                your email (it works for 24 hours), or ask for a new one in the chat.
              </p>
            </>
          )}
          {params?.ref && <p className="mt-4 text-sm text-ink-dim">Reference {params.ref}</p>}
          <p className="mt-4 text-sm text-ink-dim">Questions? Call {callUs}.</p>
          <Link to="/" className="mt-6 inline-block font-bold text-action hover:underline">
            Back to the home page
          </Link>
        </div>
      </Container>
    </Section>
  );
}

export default Deposit;
