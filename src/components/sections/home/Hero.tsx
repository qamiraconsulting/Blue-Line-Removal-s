import { motion } from "framer-motion";
import { Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { hero } from "@/data/content/home";
import { images } from "@/data/content/images";
import { ease } from "@/lib/motion";

export function Hero() {
  const [headingLead] = hero.heading.split(hero.headingAccent);

  return (
    <>
      {/* Below lg: the truck photo already runs full-bleed behind this
          section (below), so text sits directly on top of it rather than
          also duplicating the truck in a separate boxed image. */}
      <section className="relative overflow-hidden bg-navy pb-20 pt-24 lg:hidden">
        <div className="absolute inset-0">
          <img
            src={images.hero}
            alt="Blue Line Removals branded truck driving through the city at dusk"
            className="h-full w-full object-cover object-right"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-navy/5 via-navy/45 to-navy/85" />

        <Container className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="w-[42%]"
          >
            <h1 className="text-lg font-black leading-[1.15] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              {headingLead}
              <span className="text-action-bright">{hero.headingAccent}</span>
            </h1>
            <p className="mt-2 text-[11px] leading-snug text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">{hero.lede}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              <Button href={hero.primaryCta.href} arrow className="w-full px-2 py-2 text-[10px]">
                {hero.primaryCta.label}
              </Button>
              <a
                href={hero.phone.href}
                className="group flex items-center justify-start gap-1.5 text-[9.5px] font-semibold text-white/90 transition-colors hover:text-action-bright"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
                  <Phone className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true" />
                </span>
                Call us: {hero.phone.display}
              </a>
            </div>
          </motion.div>
        </Container>
      </section>

      <section className="relative hidden min-h-[92svh] items-center overflow-hidden pt-24 lg:flex">
        <div className="absolute inset-0">
          <img src={images.hero} alt="Blue Line Removals branded truck driving through the city at dusk" className="h-full w-full object-cover" />
        </div>
        {/* Kept deliberately light -- the truck and its branding should read
            clearly, not be washed out by a heavy scrim. Legibility comes
            mostly from the drop-shadow on the text below. */}
        <div className="absolute inset-0 bg-gradient-to-t from-navy/55 via-navy/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/60 via-navy/15 to-transparent" />

        <Container className="relative z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="max-w-[40rem]"
          >
            <h1 className="max-w-[16ch] text-4xl leading-[1.08] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] sm:text-5xl lg:text-[3.4rem]">
              {headingLead}
              <span className="text-action-bright">{hero.headingAccent}</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">{hero.lede}</p>
            <div className="mt-10 flex flex-col items-start gap-3">
              <Button href={hero.primaryCta.href} arrow>
                {hero.primaryCta.label}
              </Button>
              <a
                href={hero.phone.href}
                className="group flex items-center gap-2.5 font-display text-[13.5px] font-bold tracking-wide text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors hover:text-action-bright"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
                  <Phone className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                </span>
                Call us: {hero.phone.display}
              </a>
            </div>
          </motion.div>
        </Container>
      </section>
    </>
  );
}
