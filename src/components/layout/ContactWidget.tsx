import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Phone, PhoneCall, Sparkle } from "lucide-react";
import { site } from "@/data/site";
import { CallbackModal } from "@/components/layout/CallbackModal";

const SEEN_KEY = "blr-contact-widget-seen";
const COLLAPSED_KEY = "blr-contact-widget-collapsed";

// Desktop strip sizing (client decision 2026-10-01): below 1420px it starts
// minimised; 1420-1599px it's open at the compact size (108px wide); from
// 1600px (the `min-[1600px]:` classes below) it's the full 185px size.
// Each threshold is the first width where that size clears the hero
// headline (which starts 100px in at 1400, 110px at 1420, 201px at 1600).
const START_MINIMISED_BELOW = 1420;

// Shared look for the floating surfaces: header navy at ~85% + blur.
const surface = "border border-white/10 bg-navy/85 shadow-lg backdrop-blur-md";

// Same visual tokens as Button's primary variant, minus the fixed padding,
// font size, and nowrap that would stop it fitting the narrow strip.
// overflow-hidden clips the shine sweep to the button.
const quoteButton =
  "relative z-10 flex w-full items-center justify-center overflow-hidden rounded-md bg-action text-center font-display font-bold uppercase tracking-[0.02em] text-white shadow-[0_4px_14px_rgba(255,107,26,0.35)] transition-colors duration-200 hover:bg-action-bright focus-visible:outline-white";

// Secondary (outlined) style for Call / Request a Callback, so the orange
// quote button stays the one primary action.
const outlineButton =
  "flex items-center justify-center rounded-md border border-white/30 font-display font-bold uppercase tracking-[0.02em] text-white transition-colors hover:bg-white/10 focus-visible:outline-white";

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

// Pulse + glow ring, one element so they stay in sync: each 1.2s beat the
// button swells to 1.07 while a soft orange box-shadow ripples outward and
// fades. The ring restarts at zero spread/blur (i.e. hidden under the
// button), so the loop has no visible jump. `ripple` = max spread in px.
function Pulse({ children, animate, ripple }: { children: React.ReactNode; animate: boolean; ripple: number }) {
  const glow = (blur: number, spread: number, alpha: number) => `0 0 ${blur}px ${spread}px rgba(255,132,56,${alpha})`;
  return (
    <motion.div
      className="relative z-10 rounded-md"
      animate={
        animate
          ? { scale: [1, 1.07, 1], boxShadow: [glow(0, 0, 0.6), glow(ripple, ripple * 0.6, 0.3), glow(ripple * 1.3, ripple, 0)] }
          : undefined
      }
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// Diagonal light streak swept across the (overflow-hidden) button every 3s:
// 0.7s sweep + 2.3s rest. Starts parked off the left edge.
function Shine() {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent"
      style={{ skewX: -20 }}
      initial={{ x: "0%" }}
      animate={{ x: ["0%", "400%"] }}
      transition={{ duration: 0.7, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.3, delay: 0.8 }}
    />
  );
}

// Tiny twinkling stars on the button's corners (not over its text),
// staggered so only one or two are lit at a time. Click-through.
const SPARKLES = [
  { pos: "-left-1.5 -top-1.5", tone: "text-white", delay: 0 },
  { pos: "-right-1.5 -top-2", tone: "text-amber-200", delay: 0.7 },
  { pos: "-bottom-1.5 -right-1", tone: "text-white", delay: 1.4 },
  { pos: "-bottom-1 -left-2", tone: "text-amber-200", delay: 2.1 },
];

function Sparkles({ size }: { size: string }) {
  return SPARKLES.map((s) => (
    <motion.span
      key={s.pos}
      aria-hidden="true"
      className={`pointer-events-none absolute z-20 ${s.pos} ${s.tone}`}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 0.3], rotate: [0, 45, 90] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.4, delay: s.delay, ease: "easeInOut" }}
    >
      <Sparkle className={size} fill="currentColor" strokeWidth={0} />
    </motion.span>
  ));
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
  const [toggled, setToggled] = useState(false);
  // Only ever opened by a click on one of the callback buttons below.
  const [callbackOpen, setCallbackOpen] = useState(false);

  // Client-only: the prerendered HTML has no widget, so there's no flash of
  // it before the slide-in. The "seen" flag is written when the slide-in
  // actually starts (not before the delay) so React StrictMode's double
  // effect run in dev doesn't swallow the first-load animation.
  useEffect(() => {
    const storedCollapsed = readSession(COLLAPSED_KEY);
    setCollapsed(storedCollapsed !== null ? storedCollapsed === "1" : window.innerWidth < START_MINIMISED_BELOW);
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
    setToggled(true);
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
  // The strip/tab only slide in when the user toggles between them, not on
  // first mount. This must be set per element, NOT as <AnimatePresence
  // initial={false}>: that blocks the initial animation of every motion
  // component nested inside too, so the quote button's looping effects
  // (pulse, glow, shine, sparkles, kangaroo) would start on their final
  // keyframe and never run.
  const swapIn = toggled ? { x: "-100%" } : false;
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
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.button
                key="tab"
                type="button"
                aria-label="Show contact options"
                aria-expanded={false}
                onClick={() => toggle(false)}
                initial={swapIn}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={swap}
                className={`flex h-16 w-7 items-center justify-center rounded-r-lg border-l-0 text-white hover:text-action-bright min-[1600px]:h-20 min-[1600px]:w-8 ${surface}`}
              >
                <ChevronRight className="h-4 w-4 min-[1600px]:h-5 min-[1600px]:w-5" aria-hidden="true" />
              </motion.button>
            ) : (
              <motion.div
                key="strip"
                initial={swapIn}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={swap}
                className={`flex w-[108px] flex-col items-stretch gap-2.5 rounded-r-xl border-l-0 px-2 pb-2 pt-3 min-[1600px]:w-[185px] min-[1600px]:gap-5 min-[1600px]:px-3.5 min-[1600px]:pb-4 min-[1600px]:pt-8 ${surface}`}
              >
                <div className="relative">
                  {animate && <KangarooPeek className="h-[72px] w-16 min-[1600px]:h-[107px] min-[1600px]:w-24" />}
                  <Pulse animate={animate} ripple={12}>
                    <Link
                      to="/quote"
                      aria-label="Get a free quote"
                      className={`${quoteButton} px-2 py-2.5 text-[11px] leading-tight min-[1600px]:px-4 min-[1600px]:py-6 min-[1600px]:text-base`}
                    >
                      {animate && <Shine />}
                      <span>
                        Get a Free
                        <br />
                        Quote
                      </span>
                    </Link>
                  </Pulse>
                  {animate && <Sparkles size="h-3 w-3 min-[1600px]:h-3.5 min-[1600px]:w-3.5" />}
                </div>
                <a
                  href={site.phone.href}
                  aria-label={`Call Blue Line Removals on ${site.phone.display}`}
                  className="flex items-center justify-center gap-1 whitespace-nowrap rounded font-display text-[10.5px] font-bold text-white/90 transition-colors hover:text-action-bright min-[1600px]:gap-1.5 min-[1600px]:text-[15px]"
                >
                  <Phone className="h-3 w-3 shrink-0 min-[1600px]:h-[15px] min-[1600px]:w-[15px]" fill="currentColor" aria-hidden="true" />
                  {site.phone.display}
                </a>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setCallbackOpen(true)}
                  className={`${outlineButton} gap-1 px-1 py-1.5 text-left text-[10px] leading-tight min-[1600px]:gap-2 min-[1600px]:px-2 min-[1600px]:py-3 min-[1600px]:text-[13px]`}
                >
                  <PhoneCall className="h-3 w-3 shrink-0 min-[1600px]:h-4 min-[1600px]:w-4" aria-hidden="true" />
                  <span>
                    Request a
                    <br />
                    Callback
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Minimise contact options"
                  aria-expanded={true}
                  onClick={() => toggle(true)}
                  className="flex h-5 items-center justify-center rounded text-white/60 transition-colors hover:text-white min-[1600px]:h-8"
                >
                  <ChevronLeft className="h-4 w-4 min-[1600px]:h-5 min-[1600px]:w-5" aria-hidden="true" />
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
          {/* Three buttons, weighted so each label fits on one line down to a
              320px-wide phone (below 360px the callback icon drops out and
              the quote label steps down a size). */}
          <div className="flex h-[4.25rem] items-center gap-2 px-3">
            <a
              href={site.phone.href}
              aria-label={`Call Blue Line Removals on ${site.phone.display}`}
              className={`${outlineButton} h-11 min-w-0 flex-[0.75] gap-1.5 text-[13px]`}
            >
              <Phone className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true" />
              Call
            </a>
            <button
              type="button"
              aria-label="Request a callback"
              aria-haspopup="dialog"
              onClick={() => setCallbackOpen(true)}
              className={`${outlineButton} h-11 min-w-0 flex-1 gap-1.5 text-[13px]`}
            >
              <PhoneCall className="h-4 w-4 shrink-0 max-[359px]:hidden" aria-hidden="true" />
              Callback
            </button>
            <div className="relative min-w-0 flex-[1.1]">
              {animate && <KangarooPeek className="h-[54px] w-12" />}
              {/* Smaller ripple than desktop: there's only an 8px gap to the
                  Callback button. */}
              <Pulse animate={animate} ripple={6}>
                <Link to="/quote" aria-label="Get a free quote" className={`${quoteButton} h-11 whitespace-nowrap px-2 text-[13px] max-[359px]:text-xs`}>
                  {animate && <Shine />}
                  Get a Quote
                </Link>
              </Pulse>
              {animate && <Sparkles size="h-3 w-3" />}
            </div>
          </div>
        </motion.div>
      </aside>

      {/* Rendered outside both asides: their motion wrappers are transformed,
          which would make the dialog's `fixed` position relative to them
          instead of the viewport. */}
      <CallbackModal open={callbackOpen} onClose={() => setCallbackOpen(false)} />
    </>
  );
}
