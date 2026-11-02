import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { CircleCheck, Mail, Phone, PhoneCall, User, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

// Calling windows in Melbourne time (client decision 2026-10-08). Keys must
// match WINDOWS in api/callback.ts, which builds the email from them.
const WINDOWS = [
  { key: "morning", label: "Morning", hours: "8am – 12pm", end: 12 },
  { key: "afternoon", label: "Afternoon", hours: "12pm – 5pm", end: 17 },
  { key: "evening", label: "Evening", hours: "5pm – 7pm", end: 19 },
] as const;

// A window can still be picked for today until 30 minutes before it ends.
const LAST_CALL_MINUTES = 30;
const MAX_DAYS_AHEAD = 60;

type DayChoice = "today" | "tomorrow" | "other";

// The visitor's device might not be on Melbourne time, so "today" and the
// current hour come from Melbourne explicitly.
function melbourneNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action";
const labelClass = "text-xs font-bold uppercase tracking-[0.06em] text-ink-dim";

function Field({ label, id, name, type, icon: Icon, placeholder, autoComplete }: {
  label: string;
  id: string;
  name: string;
  type: string;
  icon: typeof User;
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
        <input id={id} name={name} type={type} required placeholder={placeholder} autoComplete={autoComplete} className={inputClass} />
      </div>
    </div>
  );
}

// One option in a radio group, styled as a pill. The real radio input stays
// in the DOM (visually hidden) so keyboard, screen readers and the browser's
// `required` check all work natively.
function Choice({ name, value, checked, disabled, onChange, children }: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={clsx(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-md border px-2 py-2 text-center text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-action",
        checked ? "border-action bg-action/5 text-navy" : "border-ink/15 bg-white text-ink hover:border-ink/30",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} required className="sr-only" />
      {children}
    </label>
  );
}

export function CallbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<DayChoice | null>(null);
  const [otherDate, setOtherDate] = useState("");
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [now, setNow] = useState(melbourneNow);

  // Fresh form every time it opens; "now" is re-read so today's windows are
  // right even if the page has been open for hours.
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setError(null);
    setDay(null);
    setOtherDate("");
    setWindowKey(null);
    setNow(melbourneNow());
  }, [open]);

  // Lock page scroll, close on Escape, move focus into the dialog, and give
  // focus back to whatever opened it when it closes.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Focus the dialog itself, not the first field, so phones don't pop the
    // keyboard up over the form the moment it opens.
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 50);
    return () => {
      root.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      opener?.focus?.();
    };
  }, [open, onClose]);

  // Keep Tab / Shift+Tab cycling inside the dialog while it's open.
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, a[href], input:not([disabled]):not([tabindex=\"-1\"]), select, textarea")].filter(
      (el) => el.offsetParent !== null || el.matches("input[type=radio]"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const tomorrow = addDays(now.date, 1);
  const windowOpenToday = (end: number) => now.minutes < end * 60 - LAST_CALL_MINUTES;
  const todayAvailable = WINDOWS.some((w) => windowOpenToday(w.end));
  const date = day === "today" ? now.date : day === "tomorrow" ? tomorrow : otherDate;

  function chooseDay(next: DayChoice) {
    setDay(next);
    // A window that's already over today can't stay selected.
    if (next === "today" && windowKey) {
      const w = WINDOWS.find((w) => w.key === windowKey);
      if (w && !windowOpenToday(w.end)) setWindowKey(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !windowKey) return;
    setError(null);
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      date,
      window: windowKey,
      company: data.get("company"),
    };

    try {
      const res = await fetch("/api/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        setError(result.error ?? "We couldn't send that just now.");
        return;
      }
      setSubmitted(true);
      trackEvent("callback_requested", { callback_window: windowKey });
    } catch {
      setError("We couldn't send that just now. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fade = { duration: reduceMotion ? 0 : 0.2, ease: "easeOut" as const };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end justify-center p-3 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={trapFocus}
            initial={reduceMotion ? false : { y: 24, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { y: 24, scale: 0.98 }}
            transition={fade}
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-paper hover:text-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {submitted ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" role="status">
                <CircleCheck className="h-11 w-11 text-eco" aria-hidden="true" />
                <h2 id={titleId} className="max-w-[24ch] text-xl">
                  Thanks! We'll call you back at your chosen time.
                </h2>
                <Button variant="outline" onClick={onClose} className="mt-3">
                  Close
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 pr-8">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action/10 text-action">
                    <PhoneCall className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 id={titleId} className="text-2xl">
                    Request a Callback
                  </h2>
                </div>
                <p className="mt-2 text-sm text-ink-dim">Tell us when suits you and we'll give you a call.</p>

                <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                  {error && (
                    <p className="rounded-md border border-action/30 bg-action/5 px-3.5 py-2.5 text-sm text-action-dim" role="alert">
                      {error} You can also call us on{" "}
                      <a href={site.phone.href} className="font-semibold underline underline-offset-2">
                        {site.phone.display}
                      </a>
                      .
                    </p>
                  )}

                  <Field label="Customer Name" id="callback-name" name="name" type="text" icon={User} placeholder="Jane Smith" autoComplete="name" />
                  <Field label="Email" id="callback-email" name="email" type="email" icon={Mail} placeholder="jane@example.com" autoComplete="email" />
                  <Field label="Contact Number" id="callback-phone" name="phone" type="tel" icon={Phone} placeholder="04XX XXX XXX" autoComplete="tel" />

                  <fieldset className="grid gap-2">
                    <legend className={`${labelClass} mb-1.5`}>Suitable Time</legend>
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Day">
                      <Choice name="day" value="today" checked={day === "today"} disabled={!todayAvailable} onChange={() => chooseDay("today")}>
                        <span className="font-semibold">Today</span>
                      </Choice>
                      <Choice name="day" value="tomorrow" checked={day === "tomorrow"} onChange={() => chooseDay("tomorrow")}>
                        <span className="font-semibold">Tomorrow</span>
                      </Choice>
                      <Choice name="day" value="other" checked={day === "other"} onChange={() => chooseDay("other")}>
                        <span className="font-semibold">Another day</span>
                      </Choice>
                    </div>

                    {day === "other" && (
                      <div>
                        <label htmlFor="callback-date" className="sr-only">
                          Date
                        </label>
                        <input
                          id="callback-date"
                          type="date"
                          required
                          min={addDays(now.date, 2)}
                          max={addDays(now.date, MAX_DAYS_AHEAD)}
                          value={otherDate}
                          onChange={(e) => setOtherDate(e.target.value)}
                          className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-action"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Time of day">
                      {WINDOWS.map((w) => (
                        <Choice
                          key={w.key}
                          name="window"
                          value={w.key}
                          checked={windowKey === w.key}
                          disabled={day === "today" && !windowOpenToday(w.end)}
                          onChange={() => setWindowKey(w.key)}
                        >
                          <span className="font-semibold">{w.label}</span>
                          <span className="text-[11px] text-ink-dim">{w.hours}</span>
                        </Choice>
                      ))}
                    </div>
                    <p className="text-xs text-ink-dim">Melbourne time.</p>
                  </fieldset>

                  {/* Honeypot for bots -- hidden from people and screen readers. */}
                  <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                    <label htmlFor="callback-company">Company</label>
                    <input id="callback-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
                  </div>

                  <Button type="submit" disabled={submitting} className="mt-1 w-full justify-center">
                    {submitting ? "Sending…" : "Request My Callback"}
                  </Button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
