import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import clsx from "clsx";
import { ChatPanel } from "./ChatPanel";

// Mounted globally in Layout.tsx. Every bottom offset below is relative to
// --contact-bar-h (index.css), the height of the mobile ContactWidget bar --
// 0 on desktop, where that widget is a strip on the left edge instead. This
// is the same trick BackToTop.tsx uses, so on mobile the launcher stacks
// above BackToTop (which itself rides above the bar) instead of landing on
// top of either.
export function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/*
        Stacking, bottom to top, all measured from the bar's top edge:
        BackToTop (1.5rem, 44px tall) -> launcher (6rem, 56px tall) -> panel
        (11rem). The site header is `fixed ... z-[100]` and ~73-90px tall,
        so both pieces sit at z-[110] and the panel's height reserves 6rem
        at the top -- z-index alone only decides which fixed element wins
        an overlap, it doesn't stop the overlap.
      */}
      <button
        type="button"
        aria-label={open ? "Close chat" : "Chat with us about your move"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "fixed bottom-[calc(var(--contact-bar-h)+6rem)] right-6 z-[110] flex h-14 w-14 items-center justify-center rounded-full bg-action text-white shadow-lg transition-all duration-300 ease-signature hover:bg-action-bright",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      </button>

      <div
        className={clsx(
          "fixed bottom-[calc(var(--contact-bar-h)+11rem)] right-6 z-[110] flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-signature",
          // 100vh minus 6rem (header clearance), 11rem (the panel's bottom
          // offset) and the contact bar. Never a flat vh fraction: that
          // clipped the panel's top edge on short viewports.
          open
            ? "h-[min(600px,calc(100vh-17rem-var(--contact-bar-h)))] translate-y-0 opacity-100"
            : "pointer-events-none h-0 translate-y-4 opacity-0",
        )}
      >
        {open && <ChatPanel />}
      </div>
    </>
  );
}
