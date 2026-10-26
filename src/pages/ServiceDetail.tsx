import { Navigate, useParams } from "react-router";
import { Check, Leaf } from "lucide-react";
import type { Route } from "./+types/ServiceDetail";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/ui/CTABanner";
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

      <CTABanner heading={service.ctaHeading} body={service.ctaBody} image={ctaImage} imageAlt={service.title} />

      <Section tone="white" bordered className="py-8 sm:py-10">
        <TrustIconsRow items={trustIcons} />
      </Section>
    </>
  );
}

export default ServiceDetail;
