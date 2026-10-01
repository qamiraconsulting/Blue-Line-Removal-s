import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { site } from "@/data/site";

const SEEN_KEY = "blr-contact-widget-seen";
const COLLAPSED_KEY = "blr-contact-widget-collapsed";

// The desktop strip is ~108px wide. Page content (Container: max 1280px,
// 48px side padding at lg) only starts clear of it from about this viewport
// width, so below it the strip starts minimised instead of covering text.
const STRIP_CLEARS_CONTENT_FROM = 1420;

// Shared look for the floating surfaces: header navy at ~85% + blur.
const surface = "border border-white/10 bg-navy/85 shadow-lg backdrop-blur-md";

// Same visual tokens as Button's primary variant, minus the fixed padding,
// font size, and nowrap that would stop it fitting the narrow strip.
const quoteButton =
  "relative z-10 flex w-full items-center justify-center rounded-md bg-action text-center font-display font-bold uppercase tracking-[0.02em] text-white shadow-[0_4px_14px_rgba(255,107,26,0.35)] transition-colors duration-200 hover:bg-action-bright focus-visible:outline-white";

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.) -- the widget still works, it just
    // re-animates / forgets the minimised state on reload.
  }
}

function Pulse({ children, animate }: { children: React.ReactNode; animate: boolean }) {
  return (
    <motion.div
      className="relative z-10"
      animate={animate ? { scale: [1, 1.05, 1] } : undefined}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// Clipped to the strip of space directly above the button, so the kangaroo
// looks like it climbs up from behind the button's top edge. Never takes
// pointer events, and sits below the button (which is z-10).
function KangarooPeek({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 overflow-hidden ${className}`}>
      <motion.img
        src="/images/kangaroo-peek.png"
        alt=""
        className="h-full w-full object-contain object-bottom"
        initial={{ y: "100%" }}
        // 9s cycle: hidden ~6.75s, rise 0.45s, hold 1.2s, drop ~0.4s.
        animate={{ y: ["100%", "100%", "0%", "0%", "100%", "100%"] }}
        transition={{ duration: 9, times: [0, 0.75, 0.8, 0.9333, 0.98, 1], repeat: Infinity, ease: "easeOut", delay: 1 }}
      />
    </span>
  );
}

export function ContactWidget() {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion() ?? false;
  const hidden = pathname.replace(/\/$/, "") === "/quote";

  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Client-only: the prerendered HTML has no widget, so there's no flash of
  // it before the slide-in. The "seen" flag is written when the slide-in
  // actually starts (not before the delay) so React StrictMode's double
  // effect run in dev doesn't swallow the first-load animation.
  useEffect(() => {
    const storedCollapsed = readSession(COLLAPSED_KEY);
    setCollapsed(storedCollapsed !== null ? storedCollapsed === "1" : window.innerWidth < STRIP_CLEARS_CONTENT_FROM);
    setMounted(true);

    if (readSession(SEEN_KEY) === null && !reduceMotion) {
      setSlideIn(true);
      const timer = window.setTimeout(() => {
        writeSession(SEEN_KEY, "1");
        setShown(true);
      }, 1500);
      return () => window.clearTimeout(timer);
    }
    setShown(true);
  }, [reduceMotion]);

  // Reserves room for the mobile bar (body padding / BackToTop offset, via
  // --contact-bar-h in index.css) only while the widget is on the page.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("has-contact-bar", mounted && !hidden);
    return () => root.classList.remove("has-contact-bar");
  }, [mounted, hidden]);

  if (!mounted || hidden) return null;

  const toggle = (next: boolean) => {
    setCollapsed(next);
    writeSession(COLLAPSED_KEY, next ? "1" : "0");
  };

  const slide = { duration: slideIn ? 0.6 : 0, ease: "easeOut" as const };
  // Once the first-load slide-in has played, coming back from /quote (which
  // unmounts the widget) should show it instantly, not slide it in again.
  const slideDone = () => {
    if (shown) setSlideIn(false);
  };
  const swap = { duration: reduceMotion ? 0 : 0.25, ease: "easeOut" as const };
  const animate = !reduceMotion;

  return (
    <>
      {/* Desktop / tablet: vertical strip on the left edge. */}
      <aside aria-label="Quick contact" className="fixed left-0 top-1/2 z-[90] hidden -translate-y-1/2 md:block">
        <motion.div
          initial={slideIn ? { x: "-110%" } : false}
          animate={{ x: shown ? 0 : "-110%" }}
          transition={slide}
          onAnimationComplete={slideDone}
        >
          <AnimatePresence mode="wait" initial={false}>
            {collapsed ? (
              <motion.button
                key="tab"
                type="button"
                aria-label="Show contact options"
                aria-expanded={false}
                onClick={() => toggle(false)}
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={swap}
                className={`flex h-16 w-7 items-center justify-center rounded-r-lg border-l-0 text-white hover:text-action-bright ${surface}`}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            ) : (
              <motion.div
                key="strip"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={swap}
                className={`flex w-[108px] flex-col items-stretch gap-2.5 rounded-r-xl border-l-0 px-2 pb-2 pt-3 ${surface}`}
              >
                <div className="relative">
                  {animate && <KangarooPeek className="h-[72px] w-16" />}
                  <Pulse animate={animate}>
                    <Link to="/quote" aria-label="Get a free quote" className={`${quoteButton} px-2 py-2.5 text-[11px] leading-tight`}>
                      Get a Free
                      <br />
                      Quote
                    </Link>
                  </Pulse>
                </div>
                <a
                  href={site.phone.href}
                  aria-label={`Call Blue Line Removals on ${site.phone.display}`}
                  className="flex items-center justify-center gap-1 whitespace-nowrap rounded font-display text-[10.5px] font-bold text-white/90 transition-colors hover:text-action-bright"
                >
                  <Phone className="h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true" />
                  {site.phone.display}
                </a>
                <button
                  type="button"
                  aria-label="Minimise contact options"
                  aria-expanded={true}
                  onClick={() => toggle(true)}
                  className="flex items-center justify-center rounded py-0.5 text-white/60 transition-colors hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </aside>

      {/* Mobile: full-width bar on the bottom edge. Its 4.25rem row height
          + 1px top border must match --contact-bar-h in index.css. */}
      <aside aria-label="Quick contact" className="fixed inset-x-0 bottom-0 z-[90] md:hidden">
        <motion.div
          initial={slideIn ? { y: "110%" } : false}
          animate={{ y: shown ? 0 : "110%" }}
          transition={slide}
          onAnimationComplete={slideDone}
          className="border-t border-white/10 bg-navy/85 backdrop-blur-md"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex h-[4.25rem] items-center gap-3 px-4">
            <a
              href={site.phone.href}
              aria-label={`Call Blue Line Removals on ${site.phone.display}`}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-white/30 font-display text-sm font-bold uppercase tracking-[0.02em] text-white transition-colors hover:bg-white/10 focus-visible:outline-white"
            >
              <Phone className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              Call
            </a>
            <div className="relative flex-1">
              {animate && <KangarooPeek className="h-[54px] w-12" />}
              <Pulse animate={animate}>
                <Link to="/quote" aria-label="Get a free quote" className={`${quoteButton} h-11 px-3 text-sm`}>
                  Get a Quote
                </Link>
              </Pulse>
            </div>
          </div>
        </motion.div>
      </aside>
    </>
  );
}
