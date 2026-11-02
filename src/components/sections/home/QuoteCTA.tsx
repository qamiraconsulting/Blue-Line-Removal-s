import { Mail } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { quoteCta, promo } from "@/data/content/home";
import { site } from "@/data/site";

// Home's closing section -- the full quote form now lives on its own page
// (/quote), so this is a short CTA banner rather than an embedded form.
export function QuoteCTA() {
  return (
    <Section id="quote" tone="navy" bordered>
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
          <Reveal>
            <Eyebrow tone="white" className="mb-4">
              {quoteCta.eyebrow}
            </Eyebrow>
            <h2 className="text-3xl text-white sm:text-4xl">{quoteCta.heading}</h2>
            <p className="mt-4 max-w-[52ch] text-lg text-white/75">{quoteCta.body}</p>
            <p className="mt-3 text-sm font-bold text-action-bright">
              {promo.heading} — taken off your quote automatically.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <a href={`mailto:${site.email}`} className="flex items-center gap-3 font-display text-lg font-bold text-white hover:text-action-bright">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                {site.email}
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="flex justify-start lg:justify-end">
            <Button href={quoteCta.cta.href} arrow className="w-full justify-center sm:w-auto">
              {quoteCta.cta.label}
            </Button>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
