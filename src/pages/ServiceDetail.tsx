import { Navigate, useParams } from "react-router";
import { Check, Leaf } from "lucide-react";
import type { Route } from "./+types/ServiceDetail";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/ui/CTABanner";
import { FAQItem } from "@/components/ui/FAQItem";
import { TrustIconsRow } from "@/components/ui/TrustIconsRow";
import { TrustBar } from "@/components/sections/home/TrustBar";
import { getServiceBySlug, trustIcons } from "@/data/content/services";
import { images } from "@/data/content/images";
import { pageMeta } from "@/lib/seo";

export function meta({ params }: Route.MetaArgs) {
  return pageMeta(getServiceBySlug(params.slug)?.seo);
}

export function ServiceDetail() {
  const { slug } = useParams();
  const service = getServiceBySlug(slug);

  if (!service) {
    return <Navigate to="/services" replace />;
  }

  const [headlineLead] = service.headline.split(service.headlineAccent);
  const image = images[service.image as keyof typeof images];
  const ctaImage = images[(service.ctaImage ?? service.image) as keyof typeof images];

  return (
    <>
      {service.faqs && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: service.faqs.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            }),
          }}
        />
      )}

      <Section tone="paper" className="pt-32 sm:pt-40">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal>
              <Eyebrow className="mb-4">{service.category}</Eyebrow>
              <h1 className="max-w-[16ch] text-3xl leading-[1.1] sm:text-4xl">
                {headlineLead}
                <span className="text-action">{service.headlineAccent}</span>
              </h1>
              <p className="mt-5 max-w-[48ch] text-lg text-ink-dim">{service.intro}</p>

              {service.checklistHeading && (
                <h2 className="mt-8 font-display text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">{service.checklistHeading}</h2>
              )}
              <ul className={service.checklistHeading ? "mt-3 grid gap-3 sm:grid-cols-2" : "mt-8 grid gap-3 sm:grid-cols-2"}>
                {service.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-ink">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-action" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>

              {service.ecoCallout && (
                <div className="mt-6 flex items-start gap-3 rounded-lg bg-eco-wash p-4">
                  <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-eco" aria-hidden="true" />
                  <div>
                    <p className="font-display text-sm font-bold text-eco">{service.ecoCallout.heading}</p>
                    <p className="mt-0.5 text-sm text-ink-dim">{service.ecoCallout.body}</p>
                  </div>
                </div>
              )}
            </Reveal>

            <Reveal delay={0.1} className="aspect-[4/3] overflow-hidden rounded-xl lg:aspect-square">
              <img src={image} alt={service.title} className="h-full w-full object-cover" />
            </Reveal>
          </div>
        </Container>
      </Section>

      <TrustBar tone="navy" />

      {/* Same numbered-step look as the homepage "How It Works" section. */}
      {service.steps && (
        <Section tone="white">
          <Container>
            <Reveal className="mx-auto max-w-[52ch] text-center">
              <Eyebrow center className="mb-4">
                How It Works
              </Eyebrow>
              <h2 className="text-3xl sm:text-4xl">{service.title}, step by step.</h2>
            </Reveal>

            <RevealGroup
              className={
                service.steps.length === 4
                  ? "relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
                  : "relative mt-14 grid gap-8 sm:grid-cols-3"
              }
            >
              <div aria-hidden="true" className="absolute inset-x-0 top-6 hidden h-px bg-ink/10 lg:block" />
              {service.steps.map((step, i) => (
                <RevealItem key={step.title} className="relative flex flex-col items-start">
                  <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy font-display text-base font-black text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 text-lg">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-dim">{step.body}</p>
                </RevealItem>
              ))}
            </RevealGroup>
          </Container>
        </Section>
      )}

      {service.faqs && (
        <Section tone="paper">
          <Container>
            <Reveal className="text-center">
              <Eyebrow center className="mb-4 justify-center">
                FAQs
              </Eyebrow>
              <h2 className="mx-auto max-w-[24ch] text-3xl sm:text-4xl">{service.title} questions</h2>
            </Reveal>

            <RevealGroup className="mx-auto mt-12 flex max-w-2xl flex-col gap-4">
              {service.faqs.map((item) => (
                <RevealItem key={item.question}>
                  <FAQItem question={item.question} answer={item.answer} />
                </RevealItem>
              ))}
            </RevealGroup>
          </Container>
        </Section>
      )}

      <CTABanner heading={service.ctaHeading} body={service.ctaBody} image={ctaImage} imageAlt={service.title} />

      <Section tone="white" bordered className="py-8 sm:py-10">
        <TrustIconsRow items={trustIcons} />
      </Section>
    </>
  );
}

export default ServiceDetail;
