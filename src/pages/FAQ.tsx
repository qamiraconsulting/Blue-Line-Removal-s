import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/ui/CTABanner";
import { faq } from "@/data/content/faq";
import { images } from "@/data/content/images";
import { ease } from "@/lib/motion";

// Not shown as a Google rich result (Google retired FAQ SERP snippets in
// May 2026) -- kept for AI answer-engine citability, which is a separate
// signal from Google's own rich-result eligibility.
const faqPageSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

function FAQItem({ question, answer }: { question: string; answer: string }) {
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

export function FAQ() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema) }} />
      <Section tone="paper" className="pt-32 sm:pt-40">
        <Container>
          <Reveal className="text-center">
            <Eyebrow center className="mb-4 justify-center">
              {faq.eyebrow}
            </Eyebrow>
            <h1 className="mx-auto max-w-[24ch] text-3xl sm:text-4xl">{faq.heading}</h1>
            <p className="mx-auto mt-4 max-w-[56ch] text-lg text-ink-dim">{faq.body}</p>
          </Reveal>

          <RevealGroup className="mx-auto mt-12 flex max-w-2xl flex-col gap-4">
            {faq.items.map((item) => (
              <RevealItem key={item.question}>
                <FAQItem question={item.question} answer={item.answer} />
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </Section>

      <CTABanner
        heading="Still Have Questions?"
        body="Get a free, no-obligation quote and we'll take it from there."
        image={images.junkRemoval}
        imageAlt="Blue Line Removals crew loading a sofa into the branded truck"
      />
    </>
  );
}

export default FAQ;
