import { Outlet } from "react-router";
import { SkipLink } from "@/components/layout/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BackToTop } from "@/components/layout/BackToTop";
import { ContactWidget } from "@/components/layout/ContactWidget";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { site } from "@/data/site";
import { serviceAreaRegions } from "@/data/content/serviceAreas";

// Business-wide schema, present on every route since it describes the
// business itself rather than any one page. Address omitted (no public
// street address is published on-site) rather than fabricated.
const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "MovingCompany",
  name: site.name,
  description: site.description,
  url: site.url,
  email: site.email,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Melbourne",
    addressRegion: "VIC",
    addressCountry: "AU",
  },
  areaServed: Object.keys(serviceAreaRegions).map((region) => ({
    "@type": "City",
    name: region,
  })),
};

export function Layout() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <ScrollToTop />
      <SkipLink />
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <BackToTop />
      <ContactWidget />
    </>
  );
}

export default Layout;
