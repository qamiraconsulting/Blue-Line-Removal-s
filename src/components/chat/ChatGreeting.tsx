import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { greetingDone } from "@/lib/chatMascot";

const MESSAGES = [
  "G'day! 👋 Moving soon? Get your free quote in 60 seconds.",
  "No forms, no waiting. Just ask Blue for an instant price. 🦘",
  "Not sure what truck you need? I'll suggest the right one.",
  "First move with us? Get 10% off your booking! 🎉",
  "Hop in! Book your move right here, it's free to ask.",
];
// Ayesha, 2026-11-02: first message 5s after load; each message shows for 5s, the bubble then
// hides for 3s and comes back with the next one. Since 2026-11-04 it loops back to the first
// message after the last, and only stops when the bubble is closed or the chat is opened.
const SHOW_AFTER_MS = 5000;
const SHOW_MS = 5000;
const GAP_MS = 3000;

// Speech bubble above the chat launcher. Sits in the same right-hand column as the launcher,
// so it never meets the quote/call widget (a strip on the left on desktop, a bar along the
// bottom on mobile -- every offset here rides on --contact-bar-h like the launcher's).
export function ChatGreeting({ hidden, onOpenChat, onClose }: { hidden: boolean; onOpenChat: () => void; onClose: () => void }) {
  // "waiting" before the first message, "showing" a message, "gap" between messages, "done" for the visit.
  const [phase, setPhase] = useState<"waiting" | "showing" | "gap" | "done">("waiting");
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (greetingDone()) setPhase("done");
  }, []);

  useEffect(() => {
    if (hidden || phase === "done") return;
    let t: number | undefined;
    if (phase === "waiting") t = window.setTimeout(() => setPhase("showing"), SHOW_AFTER_MS);
    // The message stays up while the mouse is over it; leaving gives it a fresh 5s.
    if (phase === "showing" && !paused) {
      t = window.setTimeout(() => setPhase("gap"), SHOW_MS);
    }
    if (phase === "gap") {
      t = window.setTimeout(() => {
        setStep((s) => (s + 1) % MESSAGES.length);
        setPhase("showing");
      }, GAP_MS);
    }
    return () => window.clearTimeout(t);
  }, [hidden, phase, paused, step]);

  const visible = phase === "showing" && !hidden;

  return (
    <div
      className={clsx(
        "fixed bottom-[calc(var(--contact-bar-h)+10.25rem)] right-6 z-[110] w-[13.5rem] transition-all duration-500 ease-signature motion-reduce:transition-none sm:w-[17rem]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
      aria-hidden={!visible}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* A slightly softened, see-through white (Ayesha, 2026-11-04), no picture. */}
      <div className="relative rounded-2xl border border-navy/10 bg-white/90 shadow-xl backdrop-blur-sm">
        <button
          type="button"
          onClick={onOpenChat}
          tabIndex={visible ? 0 : -1}
          className="flex w-full items-start rounded-2xl py-2.5 pl-3.5 pr-7 text-left sm:py-3 sm:pl-4 sm:pr-8"
        >
          <span className="sr-only">Chat with Blue: </span>
          <span className="min-h-[2.5rem] text-xs font-medium leading-snug text-navy sm:min-h-[2.75rem] sm:text-sm">{MESSAGES[step]}</span>
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
        {/* Pointer down to the launcher (its centre is 28px in from the right edge of this column).
            Clipped to its lower half so the see-through white doesn't double up over the bubble. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-[7px] right-[21px] h-3.5 w-3.5 rotate-45 border-b border-r border-navy/10 bg-white/90 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      </div>
    </div>
  );
}
