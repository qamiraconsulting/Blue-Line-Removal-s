// Full 7-service catalog for the /services list page and /services/:slug
// detail pages (2026-08-10, replicated from the client's sample site --
// see BLR Sample Site-Lovejeet screenshots). Only Junk Removal's detail
// copy (headline, checklist, eco callout) came from the sample itself --
// the other six services weren't shown in detail in the screenshots, so
// their detail copy below is drafted in the same voice and flagged here
// for the client to review before launch.
export type Service = {
  slug: string;
  title: string;
  icon: "home" | "building" | "truck" | "trash" | "package" | "warehouse" | "armchair";
  listBody: string;
  listAccent?: string; // orange highlight line shown above listBody (Junk Removal only, per sample)
  ecoFriendly?: boolean;
  category: string;
  headline: string;
  headlineAccent: string; // portion of the headline rendered in orange
  intro: string;
  image: string; // key into data/content/images.ts
  checklist: string[];
  ecoCallout?: { heading: string; body: string };
  ctaHeading: string;
  ctaBody: string;
  ctaImage?: string; // key into data/content/images.ts for the bottom banner; defaults to `image`
  // Optional extras (added 2026-10-26 for the per-service junk pages) --
  // pages without them render exactly as before.
  seo?: { title: string; description: string }; // own <title>/meta description; otherwise the site-wide defaults
  checklistHeading?: string; // small label above the checklist, e.g. "What we take"
  steps?: { title: string; body: string }[]; // "How it works" section
  faqs?: { question: string; answer: string }[];
};

export const services: Service[] = [
  {
    slug: "home-removals",
    title: "Home Removals",
    icon: "home",
    listBody: "We make your home move stress-free and hassle-free.",
    category: "Home Removals",
    headline: "Your Move, Done Right.",
    headlineAccent: "Done Right.",
    intro:
      "From a studio apartment to a full family home, our crew packs, loads, drives, and unloads with care — so nothing gets left behind or damaged in transit.",
    image: "homeRemovals",
    checklist: [
      "Local & suburban moves",
      "Furniture disassembly & reassembly",
      "Careful handling of fragile items",
      "Flexible scheduling, incl. weekends",
      "Experienced, uniformed crews",
      "Free no-obligation quote",
    ],
    ctaHeading: "Ready to Move?",
    ctaBody: "Get your free quote today.",
  },
  {
    slug: "office-removals",
    title: "Office Removals",
    icon: "building",
    listBody: "Efficient office moves with minimal downtime.",
    category: "Office Removals",
    headline: "Minimal Downtime, Maximum Care.",
    headlineAccent: "Maximum Care.",
    intro:
      "Desks, IT equipment, filing systems and everything in between — we plan around your business hours so your team is back up and running fast.",
    image: "officeRemovals",
    checklist: [
      "Desk & workstation relocation",
      "IT equipment handling",
      "After-hours & weekend moves",
      "Secure filing & document transport",
      "Minimal business disruption",
      "Free no-obligation quote",
    ],
    ctaHeading: "Planning an Office Move?",
    ctaBody: "Get your free quote today.",
  },
  {
    slug: "interstate-removals",
    title: "Interstate Removals",
    icon: "truck",
    listBody: "Reliable moving services across all states and territories.",
    category: "Interstate Removals",
    headline: "Across the Country, Without the Stress.",
    headlineAccent: "Without the Stress.",
    intro:
      "Moving interstate involves more logistics, not more hassle. We plan the route, handle the paperwork, and keep you updated door to door.",
    image: "interstateRemovals",
    checklist: [
      "Coverage across all states & territories",
      "Fixed timelines & tracking",
      "Secure long-haul transport",
      "Full-service or self-pack options",
      "Fully insured in transit",
      "Free no-obligation quote",
    ],
    ctaHeading: "Moving Interstate?",
    ctaBody: "Get your free quote today.",
  },
  {
    slug: "junk-removal",
    title: "Junk Removal",
    icon: "trash",
    listBody: "We remove unwanted items quickly and responsibly.",
    listAccent: "Junk Gone, Space Won.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Junk Gone, Space Won.",
    headlineAccent: "Space Won.",
    intro: "From old furniture to general junk, we make it easy to clear out what you don't need.",
    image: "junkRemoval",
    checklist: [
      "Furniture & Appliance Removal",
      "Garden Waste Removal",
      "Garage & Shed Cleanouts",
      "Construction Debris Removal",
      "E-Waste Removal",
      "Donations & Recycling",
    ],
    ecoCallout: {
      heading: "We Care About Our Environment",
      body: "We recycle and donate as much as possible to reduce landfill waste.",
    },
    ctaHeading: "Got Junk? Let's Remove It!",
    ctaBody: "Get your free quote today.",
    ctaImage: "serviceJunk",
  },
  // Per-service junk pages (2026-10-26). Copy is drafted for Melbourne and
  // kept to what the site already promises elsewhere (free quote, no
  // call-out fee, same-day most days, recycle/donate first); the "can't
  // take" list in the FAQs is standard industry practice -- confirm with
  // the client before launch.
  {
    slug: "rubbish-removal",
    title: "Rubbish Removal",
    icon: "trash",
    listBody: "Household and general rubbish, loaded and taken away.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Rubbish Gone, Without the Tip Run.",
    headlineAccent: "Without the Tip Run.",
    intro:
      "Bags piling up after a clean-out, a renovation or just a busy month? We load household and general rubbish from anywhere on your Melbourne property and take it away. No trailer hire, no queue at the tip, no waiting weeks for the council's hard rubbish collection.",
    image: "junkRemoval",
    ctaImage: "teamTrust",
    checklistHeading: "What we take",
    checklist: [
      "Bagged household rubbish",
      "Cardboard boxes & packaging",
      "Broken homewares & bric-a-brac",
      "Old clothes, linen & soft furnishings",
      "Light DIY & renovation offcuts",
      "Clutter from rooms, cupboards & yards",
    ],
    ecoCallout: {
      heading: "Sorted Before It's Dumped",
      body: "Cardboard, metal and anything still usable is pulled out for recycling or donation first. Landfill is the last stop, not the first.",
    },
    steps: [
      { title: "Send us a photo", body: "Snap the pile and send it through the quote form or by email. A rough idea of the size of the job is all we need." },
      { title: "Get your price", body: "You'll have a free quote before anything is lifted, with no call-out fee just to find out the cost." },
      { title: "We do the lifting", body: "Our crew carries it all out from wherever it's sitting and loads it onto the truck. No need to drag anything to the kerb." },
      { title: "Sorted, not just dumped", body: "Recyclables and anything worth donating are separated first, and the rest is disposed of properly." },
    ],
    faqs: [
      {
        question: "Do I need to bag everything or carry it out first?",
        answer:
          "No. Bagging loose rubbish helps, but our crew does the lifting and carrying, so you don't need to move anything to the kerb or the driveway yourself.",
      },
      {
        question: "Can you take just a small load?",
        answer: "Yes. Whether it's a few bags or a garage full, send a photo and we'll quote for what's actually there.",
      },
      {
        question: "How is this different from council hard rubbish?",
        answer:
          "Council hard rubbish runs on the council's schedule and usually limits what and how much you can put out. We come when it suits you, often the same day, and take it straight from your property, so nothing sits on the nature strip waiting.",
      },
      {
        question: "Is there anything you can't take?",
        answer:
          "We can't take hazardous waste such as asbestos, chemicals, paint, gas bottles or medical waste. If you're not sure about something, mention it when you ask for a quote.",
      },
    ],
    seo: {
      title: "Rubbish Removal Melbourne | Blue Line Removals",
      description:
        "Household and general rubbish removal across Melbourne. Free quote, no call-out fee, same-day pickups most days, and recycled before landfill.",
    },
    ctaHeading: "Ready to Clear the Rubbish?",
    ctaBody: "Send a photo for a free, no-obligation quote.",
  },
  {
    slug: "packing-unpacking",
    title: "Packing & Unpacking",
    icon: "package",
    listBody: "Professional packing services to keep your items safe.",
    category: "Packing & Unpacking",
    headline: "Pack Less, Stress Less.",
    headlineAccent: "Stress Less.",
    intro:
      "Don't want to spend your weekend wrapping glassware? We pack a room, a kitchen, or the whole house — materials included — and unpack on the other end if you need it.",
    image: "packingUnpacking",
    checklist: [
      "Full or partial packing service",
      "Quality packing materials supplied",
      "Careful handling of fragile & valuable items",
      "Labelled boxes for an easy unpack",
      "Unpacking & settling-in service",
      "Free no-obligation quote",
    ],
    ctaHeading: "Need a Hand Packing?",
    ctaBody: "Get your free quote today.",
  },
  {
    slug: "storage-solutions",
    title: "Storage Solutions",
    icon: "warehouse",
    listBody: "Secure short and long term storage solutions available.",
    category: "Storage Solutions",
    headline: "Secure Storage, Any Timeframe.",
    headlineAccent: "Any Timeframe.",
    intro:
      "Between homes, renovating, or just need the space? Store your belongings in our secure, monitored facility for as long as you need.",
    image: "storageSolutions",
    checklist: [
      "Short & long-term storage",
      "Clean, secure, monitored facility",
      "Flexible month-to-month terms",
      "Easy access when you need it",
      "Free pickup & delivery available",
      "Free no-obligation quote",
    ],
    ctaHeading: "Need Somewhere to Store It?",
    ctaBody: "Get your free quote today.",
  },
  {
    slug: "specialty-items",
    title: "Specialty Items",
    icon: "armchair",
    listBody: "Piano, pool tables, antique & fragile item specialists.",
    category: "Specialty Items",
    headline: "Handled With Real Care.",
    headlineAccent: "Real Care.",
    intro:
      "Pianos, pool tables, antiques, artwork and other awkward or fragile items need specialist handling — our crew has the equipment and experience to move them safely.",
    image: "specialtyItems",
    checklist: [
      "Piano & pool table relocation",
      "Antique & fine art handling",
      "Custom crating for fragile pieces",
      "Specialist equipment & rigging",
      "Fully insured for high-value items",
      "Free no-obligation quote",
    ],
    ctaHeading: "Got Something Special to Move?",
    ctaBody: "Get your free quote today.",
  },
];

export function getServiceBySlug(slug: string | undefined) {
  return services.find((s) => s.slug === slug);
}

export const trustIcons = [
  { icon: "badge-dollar", label: "Upfront Pricing" },
  { icon: "clock", label: "On-Time, Every Time" },
  { icon: "users", label: "Friendly Team" },
  { icon: "recycle", label: "Eco-Friendly Disposal" },
] as const;
