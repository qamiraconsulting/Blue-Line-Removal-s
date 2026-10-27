import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/ui/CTABanner";
import { services, type Service } from "@/data/content/services";
import { images } from "@/data/content/images";

// /services redesign (2026-10-26, client spec): navy hero with a Moving /
// Junk toggle, then one grid of detailed service cards for the selected
// type. Every card's copy comes from its own service entry -- the one-line
// `listBody` and the first three checklist points -- so nothing here is
// new wording. The homepage "Two Services" cards are unaffected.
const groups = {
  moving: {
    label: "Moving Services",
    slugs: [
      "home-removals",
      "apartment-unit-moves",
      "office-removals",
      "interstate-removals",
      "packing-unpacking",
      "storage-solutions",
      "specialty-items",
    ],
  },
  junk: {
    label: "Junk Removal",
    slugs: ["furniture-removal", "rubbish-removal", "green-waste-removal", "garage-shed-clear-outs", "end-of-lease-clean-outs"],
  },
} as const;

type GroupKey = keyof typeof groups;

// Same three promises as the Quote page's trust row.
const trustLine = ["Fully insured", "No hidden fees", "2hr response"];

function groupServices(key: GroupKey) {
  return groups[key].slugs.flatMap((slug) => services.filter((s) => s.slug === slug));
}

function ServiceCard({ service }: { service: Service }) {
  return (
    <li className="flex w-full flex-col overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
      <div className="aspect-[16/10] overflow-hidden bg-paper-2">
        <img src={images[service.image as keyof typeof images]} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg">{service.title}</h3>
        <p className="mt-1 text-sm text-ink-dim">{service.listBody}</p>
        <ul className="mt-4 grid gap-2">
          {service.checklist.slice(0, 3).map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm text-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-action" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <Link
            to={`/services/${service.slug}`}
            aria-label={`Learn more about ${service.title}`}
            className="group inline-flex items-center gap-1.5 font-display text-sm font-bold text-navy transition-colors hover:text-action"
          >
            Learn more
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            to="/quote"
            aria-label={`Get a quote for ${service.title}`}
            className="inline-flex items-center rounded-md bg-action px-3.5 py-2 font-display text-xs font-bold uppercase tracking-[0.02em] text-white shadow-[0_4px_14px_rgba(255,107,26,0.25)] transition-colors hover:bg-action-bright"
          >
            Get quote
          </Link>
        </div>
      </div>
    </li>
  );
}

export function Services() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reduceMotion = useReducedMotion() ?? false;

  // The page is prerendered without a query string, so the first render
  // always matches that HTML (Moving); ?type=junk is applied right after
  // hydration instead of causing a hydration mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const active: GroupKey = hydrated && searchParams.get("type") === "junk" ? "junk" : "moving";

  // Updates the URL (so ?type=junk can be shared/bookmarked) without a
  // reload, a new history entry, or a jump back to the top.
  function select(key: GroupKey) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === "junk") next.set("type", "junk");
        else next.delete("type");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  const fade = { duration: reduceMotion ? 0 : 0.25, ease: "easeOut" as const };

  return (
    <>
      {/* Compact header (2026-10-27): same light background as the cards, so
          the cards start right below the toggle. */}
      <Section tone="paper" className="pt-28 sm:pt-32">
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow center className="mb-3 justify-center">
              Our Services
            </Eyebrow>
            <h1 className="text-3xl leading-[1.15] sm:text-4xl">
              Moving or clearing out? <span className="text-action sm:block">We handle it&nbsp;all.</span>
            </h1>
            <p className="mx-auto mt-3 max-w-[52ch] text-base text-ink-dim sm:text-lg">
              Home and office moves, packing, storage and junk clear-outs across Melbourne, all with one trusted team.
            </p>

            <div role="group" aria-label="Show services for" className="mt-6 inline-flex rounded-xl border border-ink/10 bg-white p-1 shadow-sm">
              {(Object.keys(groups) as GroupKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active === key}
                  aria-controls="service-cards"
                  onClick={() => select(key)}
                  className={clsx(
                    "rounded-lg px-4 py-2.5 font-display text-sm font-bold uppercase tracking-[0.02em] transition-colors duration-200 sm:px-6",
                    active === key ? "bg-action text-white shadow-[0_4px_14px_rgba(255,107,26,0.3)]" : "text-navy hover:bg-paper",
                  )}
                >
                  {groups[key].label}
                </button>
              ))}
            </div>

            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-dim sm:gap-x-2">
              {trustLine.map((item, i) => (
                <span key={item} className="inline-flex items-center gap-1">
                  {i > 0 && (
                    <span aria-hidden="true" className="mr-1 hidden sm:inline">
                      ·
                    </span>
                  )}
                  <Check className="h-3.5 w-3.5 text-action" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </p>
          </Reveal>

          <h2 className="sr-only">{groups[active].label}</h2>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul
              key={active}
              id="service-cards"
              className="mt-10 flex flex-wrap justify-center gap-6"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={fade}
            >
              {groupServices(active).map((service) => (
                <ServiceCard key={service.slug} service={service} />
              ))}
            </motion.ul>
          </AnimatePresence>
        </Container>
      </Section>

      <CTABanner
        heading="Need Help Deciding?"
        body="We're here to help! Get in touch and we'll point you at the right service."
        image={images.junkRemoval}
        imageAlt="Blue Line Removals crew loading a sofa into the branded truck"
      />
    </>
  );
}

export default Services;
