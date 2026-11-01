import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { BLUE_FACE, greetingDone } from "@/lib/chatMascot";

const MESSAGES = [
  "G'day! 👋 Moving soon? Get your free quote in 60 seconds.",
  "No forms, no waiting. Just ask Blue for an instant price. 🦘",
  "Not sure what truck you need? I'll suggest the right one.",
  "First move with us? Get 10% off your booking! 🎉",
  "Hop in! Book your move right here, it's free to ask.",
];
const SHOW_AFTER_MS = 5000;
const EACH_MS = 6000;
const FADE_MS = 300;
// Twice through the list, then it stays on the last message.
const LAST_STEP = MESSAGES.length * 2 - 1;

// Speech bubble above the chat launcher. Sits in the same right-hand column as the launcher,
// so it never meets the quote/call widget (a strip on the left on desktop, a bar along the
// bottom on mobile -- every offset here rides on --contact-bar-h like the launcher's).
export function ChatGreeting({ hidden, onOpenChat, onClose }: { hidden: boolean; onOpenChat: () => void; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (greetingDone()) return;
    const t = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Next message every 6s, fading out for the last 300ms of each; paused while hovered.
  useEffect(() => {
    if (!ready || hidden || paused || step >= LAST_STEP) return;
    const fadeOut = window.setTimeout(() => setFading(true), EACH_MS - FADE_MS);
    const next = window.setTimeout(() => {
      setStep((s) => s + 1);
      setFading(false);
    }, EACH_MS);
    return () => {
      window.clearTimeout(fadeOut);
      window.clearTimeout(next);
    };
  }, [ready, hidden, paused, step]);

  const visible = ready && !hidden;

  return (
    <div
      className={clsx(
        "fixed bottom-[calc(var(--contact-bar-h)+10.25rem)] right-6 z-[110] w-[13.5rem] transition-all duration-500 ease-signature motion-reduce:transition-none sm:w-[17rem]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
      aria-hidden={!visible}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        setFading(false);
      }}
    >
      <div className="relative rounded-2xl border border-navy/10 bg-white shadow-xl">
        <button
          type="button"
          onClick={onOpenChat}
          tabIndex={visible ? 0 : -1}
          className="flex w-full items-start gap-2.5 rounded-2xl py-2.5 pl-2.5 pr-7 text-left sm:gap-3 sm:py-3 sm:pl-3 sm:pr-8"
        >
          <img src={BLUE_FACE} alt="" width={36} height={36} className="h-7 w-7 flex-none rounded-full bg-navy sm:h-9 sm:w-9" />
          <span className="sr-only">Chat with Blue: </span>
          <span
            className={clsx(
              "min-h-[2.5rem] text-xs font-medium leading-snug text-navy transition-opacity duration-300 motion-reduce:transition-none sm:min-h-[2.75rem] sm:text-sm",
              fading && !paused ? "opacity-0" : "opacity-100",
            )}
          >
            {MESSAGES[step % MESSAGES.length]}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          tabIndex={visible ? 0 : -1}
          aria-label="Close message"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-ink-dim hover:bg-paper hover:text-navy"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {/* Pointer down to the launcher (its centre is 28px in from the right edge of this column). */}
        <span
          aria-hidden="true"
          className="absolute -bottom-[7px] right-[21px] h-3.5 w-3.5 rotate-45 border-b border-r border-navy/10 bg-white"
        />
      </div>
    </div>
  );
}
