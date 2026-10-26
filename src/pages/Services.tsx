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
// client request), but every item links to its own service page and
// neither card has a bottom button (the homepage's would just point back
// here or to the general junk page). Card titles, photos and the junk
// items' wording come from the homepage data; the homepage itself keeps
// its own links.
const [homeMoving, homeJunk] = servicesDetailed.categories;
const movingSlugs = [
  "home-removals",
  "apartment-unit-moves",
  "office-removals",
  "interstate-removals",
  "packing-unpacking",
  "storage-solutions",
  "specialty-items",
];
const junkPages: Record<string, string> = {
  "Furniture Removal": "/services/furniture-removal",
  "Rubbish Removal": "/services/rubbish-removal",
  "Green Waste Removal": "/services/green-waste-removal",
  "Garage & Shed Clear Outs": "/services/garage-shed-clear-outs",
  "End of Lease Clean Outs": "/services/end-of-lease-clean-outs",
};

const categories: ServiceCategory[] = [
  {
    ...homeMoving,
    cta: undefined,
    items: movingSlugs.flatMap((slug) => {
      const service = services.find((s) => s.slug === slug);
      return service ? [{ icon: service.icon, title: service.title, body: service.listBody, href: `/services/${service.slug}` }] : [];
    }),
  },
  {
    ...homeJunk,
    cta: undefined,
    items: homeJunk.items.map((item) => ({ ...item, href: junkPages[item.title] ?? item.href })),
  },
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

          {/* items-start: the junk card is shorter, so it ends after its last
              item instead of stretching to match with an empty white block. */}
          <RevealGroup className="mt-12 grid gap-8 md:grid-cols-2 md:items-start">
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
