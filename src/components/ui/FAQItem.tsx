import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { ease } from "@/lib/motion";

// One expandable question, shared by the FAQ page and the FAQ block on
// service detail pages.
export function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="rounded-lg border border-ink/10 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
      >
        <span className="font-display text-base font-bold text-navy">{question}</span>
        <ChevronDown
          className={clsx("h-5 w-5 shrink-0 text-ink-dim transition-transform duration-300 ease-signature", open && "rotate-180 text-action")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open &&
          (prefersReducedMotion ? (
            <div className="overflow-hidden">
              <p className="px-5 pb-5 text-sm text-ink-dim">{answer}</p>
            </div>
          ) : (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              className="overflow-hidden"
            >
              <p className="px-5 pb-5 text-sm text-ink-dim">{answer}</p>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}
