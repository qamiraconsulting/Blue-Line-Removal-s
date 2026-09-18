export type NavItem = {
  label: string;
  href: string;
};

// 2026-08-10: Services and Get a Quote are now real routed pages
// (/services, /services/:slug, /quote). How It Works, Service Areas, and
// Reviews still only exist as sections on the homepage, so those stay as
// "/#hash" links -- from another page they do a full navigation back to
// "/" and the browser's native anchor scroll takes it from there.
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Service Areas", href: "/#areas" },
  { label: "Reviews", href: "/#reviews" },
  { label: "FAQs", href: "/faq" },
];

export const footerNav = {
  services: [
    { label: "Home Removals", href: "/services/home-removals" },
    { label: "Office Removals", href: "/services/office-removals" },
    { label: "Interstate Removals", href: "/services/interstate-removals" },
    { label: "Junk Removal", href: "/services/junk-removal" },
    { label: "Packing & Unpacking", href: "/services/packing-unpacking" },
    { label: "Storage Solutions", href: "/services/storage-solutions" },
    { label: "Specialty Items", href: "/services/specialty-items" },
  ],
  company: [
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Service Areas", href: "/#areas" },
    { label: "Reviews", href: "/#reviews" },
    { label: "FAQs", href: "/faq" },
    { label: "Get a Quote", href: "/quote" },
  ],
} satisfies Record<string, NavItem[]>;
