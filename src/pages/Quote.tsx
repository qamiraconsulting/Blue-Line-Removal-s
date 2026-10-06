import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { User, Phone, Mail, MapPin, Calendar, Home as HomeIcon, Truck, Trash2, DollarSign, Clock, ShieldCheck, CircleCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

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
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      need,
      from: data.get("from"),
      to: data.get("to"),
      date: data.get("date"),
      propertySize: data.get("propertySize"),
    };

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        setError(result.error ?? `We couldn't send that just now. Please email us at ${site.email} instead.`);
        return;
      }
      setSubmitted(true);
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
              {submitted ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <CircleCheck className="h-10 w-10 text-eco" aria-hidden="true" />
                  <p className="font-display text-lg font-bold text-navy">Got it — thanks!</p>
                  <p className="max-w-[36ch] text-sm text-ink-dim">
                    We've received your request and will be in touch shortly with your free quote.
                  </p>
                </div>
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

                  <Field label="Moving From" id="from" type="text" placeholder="Suburb or City" icon={MapPin} />
                  <Field label="Moving To" id="to" type="text" placeholder="Suburb or City" icon={MapPin} defaultValue={prefilledTo} />
                  <Field label="Preferred Date" id="date" type="date" icon={Calendar} />

                  <div className="grid gap-1.5">
                    <label htmlFor="propertySize" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                      Property Size
                    </label>
                    <div className="relative">
                      <HomeIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
                      <select
                        id="propertySize"
                        defaultValue={propertySizes[0]}
                        className="w-full appearance-none rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                      >
                        {propertySizes.map((size) => (
                          <option key={size}>{size}</option>
                        ))}
                      </select>
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
}: {
  label: string;
  id: string;
  type: string;
  icon: typeof User;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
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
          className="w-full rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
        />
      </div>
    </div>
  );
}
