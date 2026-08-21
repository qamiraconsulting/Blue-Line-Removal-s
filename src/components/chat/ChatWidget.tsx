import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import clsx from "clsx";
import { ChatPanel } from "./ChatPanel";

// Mounted globally in Layout.tsx, same fixed-position pattern as
// BackToTop.tsx -- the chat-first contact channel the client's own
// strategy already settled on (see the roadmap's meeting-decisions
// reference), so this replaces what a phone number or callback modal used
// to be, not a form.
export function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close chat" : "Chat with us about your move"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-action text-white shadow-lg transition-all duration-300 ease-signature hover:bg-action-bright",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      </button>

      <div
        className={clsx(
          "fixed bottom-24 right-6 z-50 flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-signature",
          // Bounded by available space above the launcher (viewport height
          // minus the bottom-24 offset minus a 1.5rem top margin), not a
          // flat 70vh -- on a short viewport (a small laptop window,
          // landscape mobile) 70vh + bottom-24 can push the panel's top
          // edge above the screen and clip it. Found via the preview
          // pane's own short viewport, but a real cross-device case.
          open ? "h-[min(600px,calc(100vh-7.5rem))] translate-y-0 opacity-100" : "pointer-events-none h-0 translate-y-4 opacity-0",
        )}
      >
        {open && <ChatPanel />}
      </div>
    </>
  );
}
