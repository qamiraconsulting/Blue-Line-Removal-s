import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/ui/CTABanner";
import { ServiceCategoryCard, type ServiceCategory } from "@/components/ui/ServiceCategoryCard";
import { services } from "@/data/content/services";
import { servicesDetailed } from "@/data/content/home";
import { images } from "@/data/content/images";

// Same two photo cards as the homepage "Two Services" section (2026-10-26,
// client request). The Moving card lists every moving page in the catalog
// instead of the homepage's shortlist, and drops its "Explore Moving
// Services" button (it would link to this page). The Junk card is the
// homepage one as-is: its sub-items all go to the single junk-removal page
// until they get pages of their own.
const [homeMoving, homeJunk] = servicesDetailed.categories;
const movingSlugs = ["home-removals", "office-removals", "interstate-removals", "packing-unpacking", "storage-solutions", "specialty-items"];

const categories: ServiceCategory[] = [
  {
    ...homeMoving,
    cta: undefined,
    items: movingSlugs.flatMap((slug) => {
      const service = services.find((s) => s.slug === slug);
      return service ? [{ icon: service.icon, title: service.title, body: service.listBody, href: `/services/${service.slug}` }] : [];
    }),
  },
  homeJunk,
];

export function Services() {
  return (
    <>
      <Section tone="paper" className="pt-32 sm:pt-40">
        <Container>
          <Reveal className="text-center">
            <Eyebrow center className="mb-4 justify-center">
              Our Services
            </Eyebrow>
            <h1 className="text-3xl sm:text-4xl">
              We Handle <span className="text-action">It All</span>
            </h1>
            <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-14 rounded-full bg-action" />
          </Reveal>

          <RevealGroup className="mt-12 grid gap-8 md:grid-cols-2">
            {categories.map((category) => (
              <ServiceCategoryCard key={category.key} category={category} titleAs="h2" />
            ))}
          </RevealGroup>
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
