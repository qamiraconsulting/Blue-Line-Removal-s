import { useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { trackEvent } from "@/lib/analytics";
import { ChatPanel } from "./ChatPanel";
import { ChatGreeting } from "./ChatGreeting";
import { BLUE_FACE, markGreetingDone } from "@/lib/chatMascot";

// Mounted globally in Layout.tsx. Every bottom offset below is relative to
// --contact-bar-h (index.css), the height of the mobile ContactWidget bar --
// 0 on desktop, where that widget is a strip on the left edge instead. This
// is the same trick BackToTop.tsx uses, so on mobile the launcher stacks
// above BackToTop (which itself rides above the bar) instead of landing on
// top of either.
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [greetingClosed, setGreetingClosed] = useState(false);

  function toggle(source: "launcher" | "greeting") {
    if (!open) {
      trackEvent("chat_opened", { page: window.location.pathname, source });
      // Opening the chat retires the greeting bubble for the rest of the visit.
      markGreetingDone();
      setGreetingClosed(true);
    }
    setOpen((v) => !v);
  }

  return (
    <>
      {/*
        Stacking, bottom to top, all measured from the bar's top edge:
        BackToTop (1.5rem, 44px tall) -> launcher (6rem, 56px tall) -> panel
        (11rem), or the greeting bubble (10.25rem) while the panel is shut.
        The site header is `fixed ... z-[100]` and ~73-90px tall,
        so both pieces sit at z-[110] and the panel's height reserves 6rem
        at the top -- z-index alone only decides which fixed element wins
        an overlap, it doesn't stop the overlap.
      */}
      <button
        type="button"
        aria-label={open ? "Close chat" : "Chat with Blue about your move"}
        aria-expanded={open}
        onClick={() => toggle("launcher")}
        className={clsx(
          "fixed bottom-[calc(var(--contact-bar-h)+6rem)] right-6 z-[110] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition-all duration-300 ease-signature",
          open ? "rotate-90 bg-action text-white hover:bg-action-bright" : "border-[3px] border-action bg-white hover:scale-105",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <img src={BLUE_FACE} alt="" width={50} height={50} className="h-full w-full" />}
      </button>

      <ChatGreeting
        hidden={open || greetingClosed}
        onOpenChat={() => toggle("greeting")}
        onClose={() => {
          markGreetingDone();
          setGreetingClosed(true);
        }}
      />

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
