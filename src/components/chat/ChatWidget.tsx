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
      {/*
        Positioning notes (fixed 2026-08-22, found from a real screenshot):

        1. The site header is `fixed ... z-[100]` (Header.tsx) and ~73-90px
           tall depending on breakpoint. Both the launcher and the panel
           need a z-index above that (z-[110]) as a safety net, AND the
           panel's height must be computed leaving real clearance below
           the header -- z-index alone doesn't stop two fixed elements
           from occupying the same space, it only decides which one wins
           the overlap, which still looks broken.
        2. BackToTop.tsx sits at the exact same bottom-6 right-6 spot.
           The launcher moves up to bottom-24 to clear it (BackToTop is
           44px tall from a 24px offset -- 96px leaves a clean gap), and
           the panel moves up correspondingly to bottom-44 to keep sitting
           just above the relocated launcher.
      */}
      <button
        type="button"
        aria-label={open ? "Close chat" : "Chat with us about your move"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "fixed bottom-24 right-6 z-[110] flex h-14 w-14 items-center justify-center rounded-full bg-action text-white shadow-lg transition-all duration-300 ease-signature hover:bg-action-bright",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      </button>

      <div
        className={clsx(
          "fixed bottom-44 right-6 z-[110] flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-signature",
          // 100vh minus: 6rem clearance for the site header (tallest
          // real measurement is ~90px; 6rem/96px leaves margin) minus
          // 11rem for the bottom-44 offset (176px) the panel is anchored
          // at. Never a flat vh fraction -- see the commit history on
          // this file for why that clipped on short viewports.
          open
            ? "h-[min(600px,calc(100vh-17rem))] translate-y-0 opacity-100"
            : "pointer-events-none h-0 translate-y-4 opacity-0",
        )}
      >
        {open && <ChatPanel />}
      </div>
    </>
  );
}
