import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { User, Phone, Mail, MapPin, Calendar, Home as HomeIcon, Truck, Trash2, DollarSign, Clock, ShieldCheck, CircleCheck, MessageSquare } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import type { QuoteApiResult } from "@/lib/quoteContract";
import { addressProblem, AU_STATES, blankAddress, isBlankAddress, type AddressParts } from "@/lib/address";

const quoteTrust = [
  { icon: DollarSign, label: "No Hidden Fees" },
  { icon: Clock, label: "2hr Response" },
  { icon: ShieldCheck, label: "Fully Insured" },
];

const propertySizes = ["Studio / 1 Bed", "2 Bedroom", "3 Bedroom", "4+ Bedroom", "Office / Commercial", "Not Sure Yet"];

export function Quote() {
  const [searchParams] = useSearchParams();
  const prefilledTo = searchParams.get("to") ?? "";

  const [need, setNeed] = useState<"moving" | "junk">("moving");
  const [result, setResult] = useState<QuoteApiResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set after mount: this page is prerendered at build time, so computing "today" during
  // render would bake the build date into the HTML.
  const [minDate, setMinDate] = useState<string | undefined>(undefined);
  useEffect(() => setMinDate(new Date().toLocaleDateString("en-CA")), []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    const address = (prefix: string): AddressParts => ({
      unitNumber: String(data.get(`${prefix}_unit`) ?? ""),
      street: String(data.get(`${prefix}_street`) ?? ""),
      suburb: String(data.get(`${prefix}_suburb`) ?? ""),
      state: String(data.get(`${prefix}_state`) ?? "VIC"),
      postcode: String(data.get(`${prefix}_postcode`) ?? ""),
    });
    const fromAddress = address("from");
    const toAddress = address("to");
    // The driver needs the whole address, so a half-filled one is sent back for fixing here.
    const problem =
      (!isBlankAddress(fromAddress) || need === "moving" ? addressProblem(fromAddress, need === "moving" ? "pick-up address" : "address") : null) ??
      (need === "moving" && !isBlankAddress(toAddress) ? addressProblem(toAddress, "drop-off address") : null) ??
      (need === "moving" && isBlankAddress(toAddress) ? "Add the drop-off address." : null);
    if (problem) {
      setError(problem);
      setSubmitting(false);
      return;
    }
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      need,
      fromAddress: isBlankAddress(fromAddress) ? undefined : fromAddress,
      toAddress: need === "moving" && !isBlankAddress(toAddress) ? toAddress : undefined,
      date: data.get("date"),
      propertySize: data.get("propertySize"),
      notes: data.get("notes"),
    };

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; result?: QuoteApiResult };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `We couldn't send that just now. Please email us at ${site.email} instead.`);
        return;
      }
      // Older/degraded responses without a result still count as "received".
      setResult(body.result ?? { kind: "manual", reference: "", emailed: false });
      trackEvent("quote_submitted", { service_type: need });
    } catch {
      setError("We couldn't send that just now. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Section tone="paper" className="pt-32 sm:pt-40">
        <Container className="max-w-xl">
          <Reveal>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl sm:text-4xl">Quick Quote</h1>
              <span className="shrink-0 rounded-full border border-action/50 px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.04em] text-action">
                100% Free
              </span>
            </div>

            <div className="mt-8 rounded-xl border border-ink/10 bg-white p-6 sm:p-8">
              {result ? (
                <QuoteResultCard result={result} />
              ) : (
                <form onSubmit={handleSubmit} className="grid gap-5">
                  {error && (
                    <p className="rounded-md border border-action/30 bg-action/5 px-3.5 py-2.5 text-sm text-action-dim" role="alert">
                      {error}
                    </p>
                  )}
                  <Field label="Full Name" id="name" type="text" placeholder="Jane Smith" icon={User} required />
                  <Field label="Phone Number" id="phone" type="tel" placeholder="+61 4XX XXX XXX" icon={Phone} required />
                  <Field label="Email Address" id="email" type="email" placeholder="jane@example.com" icon={Mail} required />

                  <div className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">I need help with</span>
                    <div className="grid grid-cols-2 gap-3">
                      <NeedCard label="Moving" icon={Truck} active={need === "moving"} onClick={() => setNeed("moving")} />
                      <NeedCard label="Junk Removal" icon={Trash2} active={need === "junk"} onClick={() => setNeed("junk")} />
                    </div>
                  </div>

                  <AddressFields prefix="from" title={need === "moving" ? "Moving From" : "Address"} hint="The full pick-up address, so our driver can find you." required />
                  {need === "moving" && (
                    <AddressFields prefix="to" title="Moving To" hint="The full drop-off address." defaultSuburb={prefilledTo} required />
                  )}
                  <Field label="Preferred Date" id="date" type="date" icon={Calendar} min={minDate} required={need === "moving"} />

                  <div className="grid gap-1.5">
                    <label htmlFor="propertySize" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                      Property Size
                    </label>
                    <div className="relative">
                      <HomeIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
                      <select
                        id="propertySize"
                        name="propertySize"
                        defaultValue={propertySizes[0]}
                        className="w-full appearance-none rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                      >
                        {propertySizes.map((size) => (
                          <option key={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="notes" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                      Additional notes <span className="font-medium normal-case tracking-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <MessageSquare className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ink-dim" aria-hidden="true" />
                      <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        maxLength={1000}
                        placeholder="Stairs, parking, heavy or fragile items, anything we should know"
                        className="w-full resize-y rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                      />
                    </div>
                  </div>

                  <Button type="submit" arrow disabled={submitting} className="mt-1 w-full justify-center">
                    {submitting ? "Sending…" : "Get My Free Quote"}
                  </Button>

                  <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                    {quoteTrust.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-navy">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="text-[11px] font-medium leading-tight text-ink-dim">{label}</span>
                      </div>
                    ))}
                  </div>
                </form>
              )}
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}

export default Quote;

// A full street address in separate boxes (Ayesha, 2026-10-17): unit/house number, street,
// suburb, state and postcode, so the driver can reach the pick-up with no guessing.
function AddressFields({
  prefix,
  title,
  hint,
  required,
  defaultSuburb,
}: {
  prefix: string;
  title: string;
  hint: string;
  required?: boolean;
  defaultSuburb?: string;
}) {
  const box = "w-full rounded-md border border-ink/15 bg-white py-2.5 px-3.5 text-sm text-ink outline-none focus:border-action";
  const label = "text-xs font-bold uppercase tracking-[0.06em] text-ink-dim";
  const blank = blankAddress();
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {title}
      </legend>
      <p className="-mt-1 text-xs text-ink-dim">{hint}</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_unit`} className={label}>
            Unit / house no.
          </label>
          <input id={`${prefix}_unit`} name={`${prefix}_unit`} type="text" required={required} maxLength={30} placeholder="4/12" autoComplete="off" className={box} />
        </div>
        <div className="col-span-2 grid gap-1.5">
          <label htmlFor={`${prefix}_street`} className={label}>
            Street
          </label>
          <input id={`${prefix}_street`} name={`${prefix}_street`} type="text" required={required} maxLength={100} placeholder="Station St" autoComplete="off" className={box} />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.25rem_6rem] gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_suburb`} className={label}>
            Suburb
          </label>
          <input id={`${prefix}_suburb`} name={`${prefix}_suburb`} type="text" required={required} maxLength={60} placeholder="Preston" defaultValue={defaultSuburb} autoComplete="off" className={box} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_state`} className={label}>
            State
          </label>
          <select id={`${prefix}_state`} name={`${prefix}_state`} defaultValue={blank.state} className={box}>
            {AU_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_postcode`} className={label}>
            Postcode
          </label>
          <input
            id={`${prefix}_postcode`}
            name={`${prefix}_postcode`}
            type="text"
            inputMode="numeric"
            required={required}
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="3072"
            autoComplete="off"
            className={box}
          />
        </div>
      </div>
    </fieldset>
  );
}

function NeedCard({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Truck;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
        active ? "border-action bg-action/5" : "border-ink/15 bg-white hover:border-ink/30",
      )}
    >
      <Icon className={clsx("h-6 w-6", active ? "text-action" : "text-ink-dim")} aria-hidden="true" />
      <span className="font-display text-sm font-bold text-navy">{label}</span>
      <span
        aria-hidden="true"
        className={clsx(
          "h-3.5 w-3.5 rounded-full border-2",
          active ? "border-action bg-action" : "border-ink/25 bg-white",
        )}
      />
    </button>
  );
}

function Field({
  label,
  id,
  type,
  icon: Icon,
  required,
  placeholder,
  defaultValue,
  min,
}: {
  label: string;
  id: string;
  type: string;
  icon: typeof User;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  min?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          min={min}
          className="w-full rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
        />
      </div>
    </div>
  );
}

/** Stripe's payment page, or the demo page used until Stripe is connected. */
const isPaymentLink = (link: string) => /^https:\/\/checkout\.stripe\.com\//.test(link) || /\/deposit\?status=demo&/.test(link);

function formatAud(amount: number) {
  return `$${amount.toLocaleString("en-AU")}`;
}

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// What the customer sees after submitting: either their single fixed price, or the same
// "we've got it" message as before when a person needs to follow up. Never a rate or a
// breakdown -- only the price and what it includes.
function QuoteResultCard({ result }: { result: QuoteApiResult }) {
  if (result.kind === "manual") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <CircleCheck className="h-10 w-10 text-eco" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-navy">Got it — thanks!</p>
        <p className="max-w-[36ch] text-sm text-ink-dim">
          We've received your request and will be in touch shortly with your free quote.
          {result.emailed && " We've also emailed you a confirmation."}
        </p>
        {result.reference && <p className="text-xs text-ink-dim">Reference {result.reference}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
      {result.testMode && (
        <p className="w-full rounded-md border border-action/40 bg-action/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.06em] text-action-dim">
          Test price — placeholder rates, not a real quote
        </p>
      )}
      <CircleCheck className="h-10 w-10 text-eco" aria-hidden="true" />
      <p className="font-display text-sm font-bold uppercase tracking-[0.06em] text-ink-dim">Your estimate</p>
      <p className="font-display text-5xl font-black text-navy">{formatAud(result.amountAud)}</p>
      <p className="text-xs text-ink-dim">GST included</p>

      {result.firstMoveApplied && (
        <span className="rounded-full bg-action/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.04em] text-action-dim">
          10% first-move offer applied
        </span>
      )}
      {result.firstMoveDenied && (
        <p className="max-w-[40ch] text-xs text-ink-dim">
          The first-move offer has already been used with these details, so this is our standard price.
        </p>
      )}

      <p className="max-w-[44ch] text-sm text-ink">
        This is an estimate based on the details you&apos;ve provided. The final price may vary depending on the actual hours worked,
        inventory, access, stairs, parking and any special requirements.
      </p>

      <ul className="mt-1 grid gap-1 text-left text-sm text-ink-dim">
        {result.includes.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-eco" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-dim">
        Reference {result.reference} · valid until {formatDate(result.validUntil)}
      </p>
      {result.emailed && <p className="text-xs text-ink-dim">We've emailed you a copy of this quote.</p>}

      {result.bookingToken ? (
        <BookEstimate reference={result.reference} token={result.bookingToken} />
      ) : (
        <p className="mt-2 text-sm text-ink">
          Ready to book? Call{" "}
          <a href={site.phone.href} className="font-bold text-action hover:underline">
            {site.phone.display}
          </a>{" "}
          or reply to our email.
        </p>
      )}
    </div>
  );
}

interface BookingDeposit {
  required: boolean;
  paymentLink: string | null;
  linkValidHours?: number;
  paid?: boolean;
  finalPayment: string;
}

interface BookingInfo {
  ok: boolean;
  error?: string;
  terms?: string;
  onlineBookingOpen?: boolean;
  availableTimes?: string[];
  instantTimes?: string[];
}

/** "07:30" -> "7:30am" */
function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

// Book the estimate just shown (Ayesha, 2026-10-15): pick an arrival time if the team has set
// them up, agree to the booking terms, and it goes to the team to confirm -- they email the
// confirmed quote. Same terms and rules as the chat.
function BookEstimate({ reference, token }: { reference: string; token: string }) {
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [time, setTime] = useState("");
  const [preferred, setPreferred] = useState("");
  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; emailed: boolean; arrivalTime?: string | null; deposit?: BookingDeposit } | null>(null);
  // After the deposit message the customer says how they'd like to pay, and then gets the link.
  const [payHow, setPayHow] = useState<"card" | "bank" | null>(null);

  useEffect(() => {
    fetch(`/api/booking?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`)
      .then((res) => res.json() as Promise<BookingInfo>)
      .then(setInfo)
      .catch(() => setInfo({ ok: false, error: "Online booking isn't available right now." }));
  }, [reference, token]);

  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const noteParts = [!time && preferred ? `Preferred arrival time: ${preferred}` : "", notes].filter(Boolean);
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, token, agreedToTerms: agreed, arrivalTime: time || undefined, notes: noteParts.join(" -- ") || undefined }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; status?: string; emailed?: boolean; arrivalTime?: string | null; availableTimes?: string[]; deposit?: BookingDeposit };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't take that booking just now. Please call us instead.");
        if (body.availableTimes && info) setInfo({ ...info, availableTimes: body.availableTimes });
        setTime("");
        return;
      }
      setDone({ status: body.status ?? "requested", emailed: Boolean(body.emailed), arrivalTime: body.arrivalTime, deposit: body.deposit });
      trackEvent(body.status === "confirmed" ? "form_booking_confirmed" : "form_booking_requested");
    } catch {
      setError("We couldn't take that booking just now. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const callUs = (
    <a href={site.phone.href} className="font-bold text-action hover:underline">
      {site.phone.display}
    </a>
  );

  if (done) {
    const booked = done.status === "confirmed" || done.status === "already_confirmed";
    const deposit = done.deposit;
    return (
      <div className="mt-4 w-full rounded-lg border border-eco/40 bg-eco/5 p-4 text-left text-sm text-ink" role="status">
        <p className="font-display text-base font-bold text-navy">{booked ? "You're booked!" : "Booking request received"}</p>
        <p className="mt-1">
          {booked
            ? `Your move is booked${done.arrivalTime ? ` with arrival at ${formatTime(done.arrivalTime)}` : ""}. We've emailed your confirmed quote.`
            : deposit?.required && !deposit.paid
              ? "To lock in your booking we take a $100 deposit before the move."
              : "Our team will check the details and confirm your booking shortly — you'll get your confirmed quote by email."}
        </p>
        {!booked && deposit?.required && !deposit.paid && (
          <div className="mt-3">
            {deposit.paymentLink && isPaymentLink(deposit.paymentLink) ? (
              <>
                <p className="font-bold text-navy">How would you like to pay the $100 deposit?</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="How would you like to pay the deposit?">
                  {(
                    [
                      ["card", "Card"],
                      ["bank", "Bank transfer"],
                    ] as const
                  ).map(([how, text]) => (
                    <button
                      key={how}
                      type="button"
                      aria-pressed={payHow === how}
                      onClick={() => setPayHow(how)}
                      className={clsx(
                        "rounded-full border px-4 py-2 text-sm font-bold",
                        payHow === how ? "border-action bg-action text-white" : "border-ink/20 bg-white text-navy hover:border-action",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {payHow && (
                  <div className="mt-3">
                    <a
                      href={deposit.paymentLink}
                      className="inline-flex items-center rounded-full bg-action px-5 py-2.5 font-bold text-white hover:opacity-90"
                      onClick={() => trackEvent("deposit_link_clicked", { pay_how: payHow })}
                    >
                      Pay $100 deposit securely
                    </a>
                    <p className="mt-2 text-xs text-ink-dim">
                      {payHow === "card" ? "Pay by card on the secure payment page." : "On the secure payment page, choose to pay straight from your bank account."} The link works for{" "}
                      {deposit.linkValidHours ?? 24} hours{done.emailed ? " and we've emailed it to you" : ""}. As soon as it's paid we confirm your booking (if your arrival time is still free) and email you.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-dim">We'll email you a secure payment link for it shortly.</p>
            )}
            <p className="mt-2 text-xs text-ink-dim">{deposit.finalPayment}</p>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-dim">
          Reference {reference} · Questions? Call {callUs}
        </p>
      </div>
    );
  }

  if (!info) return <p className="mt-4 text-xs text-ink-dim">Loading booking options...</p>;
  if (!info.ok || !info.terms) {
    return (
      <p className="mt-4 text-sm text-ink">
        Ready to book? Call {callUs} or reply to our email.
      </p>
    );
  }

  const times = info.onlineBookingOpen ? (info.availableTimes ?? []) : [];
  return (
    <form onSubmit={book} className="mt-4 grid w-full gap-4 rounded-lg border border-ink/10 bg-paper p-4 text-left">
      <p className="font-display text-base font-bold text-navy">Book this estimate</p>

      {times.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">Arrival time</legend>
          <div className="flex flex-wrap gap-2">
            {times.map((t) => (
              <label
                key={t}
                className={clsx(
                  "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm",
                  time === t ? "border-action bg-action/10 font-bold text-action-dim" : "border-ink/15 bg-white text-ink",
                )}
              >
                <input type="radio" name="arrivalTime" value={t} checked={time === t} onChange={() => setTime(t)} className="sr-only" required />
                {formatTime(t)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
            Preferred arrival time <span className="font-medium normal-case tracking-normal">(optional)</span>
          </span>
          <input
            value={preferred}
            onChange={(e) => setPreferred(e.target.value)}
            maxLength={60}
            placeholder="e.g. early morning"
            className="rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
      )}

      <label className="grid gap-1.5 text-sm">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
          Anything else for the team <span className="font-medium normal-case tracking-normal">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={400}
          className="resize-y rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-action"
        />
      </label>

      <div className="rounded-md border border-ink/15 bg-white p-3 text-xs leading-relaxed text-ink-dim">
        <p className="mb-1 font-bold uppercase tracking-[0.06em]">Booking terms</p>
        <p>{info.terms}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-action" />
        <span>I agree to the booking terms and would like to book this estimate.</span>
      </label>

      {error && (
        <p className="rounded-md border border-action/30 bg-action/5 px-3 py-2 text-sm text-action-dim" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" arrow disabled={sending || !agreed} className="w-full justify-center">
        {sending ? "Sending…" : time && info.instantTimes?.includes(time) ? "Book now" : "Request booking"}
      </Button>
      <p className="text-center text-xs text-ink-dim">Prefer to talk? Call {callUs}.</p>
    </form>
  );
}
