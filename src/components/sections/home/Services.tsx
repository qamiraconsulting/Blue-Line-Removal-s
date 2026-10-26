import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { ServiceCategoryCard } from "@/components/ui/ServiceCategoryCard";
import { servicesDetailed } from "@/data/content/home";

export function Services() {
  return (
    <Section id="services" tone="white">
      <Container>
        <Reveal className="text-center">
          <Eyebrow center className="mb-4 justify-center">
            {servicesDetailed.eyebrow}
          </Eyebrow>
          <h2 className="mx-auto max-w-[24ch] text-3xl sm:text-4xl">{servicesDetailed.heading}</h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-lg text-ink-dim">{servicesDetailed.body}</p>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-8 md:grid-cols-2">
          {servicesDetailed.categories.map((category) => (
            <ServiceCategoryCard key={category.key} category={category} />
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}
