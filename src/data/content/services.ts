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
  icon: "home" | "apartment" | "building" | "truck" | "trash" | "package" | "warehouse" | "armchair" | "leaf" | "key";
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
  // Same design as Home Removals (2026-10-26); copy drafted for Melbourne,
  // photos are reused placeholders until new branded ones are made.
  {
    slug: "apartment-unit-moves",
    title: "Apartment & Unit Moves",
    icon: "apartment",
    listBody: "Apartments, units and townhouses, planned around your building.",
    category: "Apartment & Unit Moves",
    headline: "Lifts, Stairs, Sorted.",
    headlineAccent: "Sorted.",
    intro:
      "Apartment moves come with their own hurdles: lifts to book, tight corridors, stairwells and nowhere to park the truck. We plan the move around your building, from the CBD towers to a walk-up unit in the suburbs, so your things get in and out safely.",
    image: "hero",
    ctaImage: "homeRemovals",
    checklistHeading: "What's included",
    checklist: [
      "Studio to 3-bedroom apartments",
      "Units & townhouses",
      "Moves planned around lift bookings",
      "Stairs & tight-access handling",
      "Furniture wrapped & protected",
      "Free no-obligation quote",
    ],
    seo: {
      title: "Apartment & Unit Removalists Melbourne | Blue Line Removals",
      description:
        "Apartment, unit and townhouse moves across Melbourne, planned around lifts, stairs and parking. Careful handling and a free, no-obligation quote.",
    },
    ctaHeading: "Moving Apartments?",
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
    ctaImage: "teamTrust",
  },
  // Per-service junk pages (2026-10-26), same design as Junk Removal. Copy
  // is drafted for Melbourne and kept to what the site already promises
  // elsewhere (free quote, no call-out fee, same-day most days,
  // recycle/donate first); the "What we take" lists should be confirmed
  // with the client. Photos are reused placeholders until new branded ones
  // are made -- see the image list in the 2026-10-26 handover.
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
    seo: {
      title: "Rubbish Removal Melbourne | Blue Line Removals",
      description:
        "Household and general rubbish removal across Melbourne. Free quote, no call-out fee, same-day pickups most days, and recycled before landfill.",
    },
    ctaHeading: "Ready to Clear the Rubbish?",
    ctaBody: "Send a photo for a free, no-obligation quote.",
  },
  {
    slug: "furniture-removal",
    title: "Furniture Removal",
    icon: "armchair",
    listBody: "Sofas, beds, wardrobes and more, carried out for you.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Old Furniture Out, Room to Breathe.",
    headlineAccent: "Room to Breathe.",
    intro:
      "Upgrading the lounge, emptying a spare room or sorting out a family home? We carry unwanted furniture out of any room and take it away, so you're not stuck with a couch you can't shift on your own or a wardrobe that won't fit in the car.",
    image: "officeRemovals",
    ctaImage: "hero",
    checklistHeading: "What we take",
    checklist: [
      "Sofas, couches & armchairs",
      "Beds, bases & mattresses",
      "Wardrobes, dressers & drawers",
      "Dining tables & chairs",
      "Desks, shelving & bookcases",
      "Outdoor & patio furniture",
    ],
    ecoCallout: {
      heading: "Good Pieces Get a Second Life",
      body: "Furniture in usable condition is set aside for donation where possible, and timber and metal go to recycling before anything heads to landfill.",
    },
    seo: {
      title: "Furniture Removal Melbourne | Blue Line Removals",
      description:
        "Old sofas, beds, wardrobes and tables carried out and taken away across Melbourne. Free quote, no call-out fee, donated or recycled where possible.",
    },
    ctaHeading: "Furniture Taking Up Space?",
    ctaBody: "Send a photo for a free, no-obligation quote.",
  },
  {
    slug: "green-waste-removal",
    title: "Green Waste Removal",
    icon: "leaf",
    listBody: "Branches, clippings and garden clean-up waste.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Garden Cleared, Green Waste Gone.",
    headlineAccent: "Green Waste Gone.",
    intro:
      "Pruned branches, a pile of lawn clippings or everything left over from a weekend in the garden? We load green waste straight from your yard and take it away, so you're not waiting weeks for the green bin to catch up or the next council collection.",
    image: "teamTrust",
    ctaImage: "hero",
    checklistHeading: "What we take",
    checklist: [
      "Branches & tree prunings",
      "Hedge & shrub clippings",
      "Lawn clippings & leaves",
      "Weeds & pulled-out plants",
      "Old garden beds & timber edging",
      "Bagged garden waste",
    ],
    ecoCallout: {
      heading: "Green Waste, Kept Green",
      body: "Garden waste goes for mulching or composting wherever Melbourne's facilities allow, rather than being buried in landfill.",
    },
    seo: {
      title: "Green Waste Removal Melbourne | Blue Line Removals",
      description:
        "Branches, prunings, lawn clippings and garden clean-up waste removed across Melbourne. Free quote, no call-out fee, same-day pickups most days.",
    },
    ctaHeading: "Garden Clean-Up Done?",
    ctaBody: "Send a photo of the pile for a free, no-obligation quote.",
  },
  {
    slug: "garage-shed-clear-outs",
    title: "Garage & Shed Clear Outs",
    icon: "warehouse",
    listBody: "Tools, boxes and clutter cleared from garages and sheds.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Park in Your Garage Again.",
    headlineAccent: "Garage Again.",
    intro:
      "Years of boxes, broken tools and things you'll fix one day can fill a garage or shed faster than you'd think. Show us what's going and what's staying, and our crew does the carrying, leaving the space clear and ready to use again.",
    image: "before",
    ctaImage: "hero",
    checklistHeading: "What we take",
    checklist: [
      "Old tools & hardware",
      "Boxes & stored household items",
      "Broken bikes & sporting gear",
      "Old appliances & e-waste",
      "Shelving, benches & cabinets",
      "Garden tools & equipment",
    ],
    ecoCallout: {
      heading: "Sorted As We Go",
      body: "Metal, e-waste and anything still usable is separated for recycling or donation while we clear, so less of your garage ends up in landfill.",
    },
    seo: {
      title: "Garage & Shed Clear Outs Melbourne | Blue Line Removals",
      description:
        "Garage and shed clean-outs across Melbourne. We carry out old tools, boxes, appliances and clutter. Free quote, no call-out fee, recycled first.",
    },
    ctaHeading: "Ready to Reclaim the Garage?",
    ctaBody: "Send a photo for a free, no-obligation quote.",
  },
  {
    slug: "end-of-lease-clean-outs",
    title: "End of Lease Clean Outs",
    icon: "key",
    listBody: "Rental clear-outs for tenants, landlords and agents.",
    ecoFriendly: true,
    category: "Junk Removal",
    headline: "Moving Out? Leave It Empty.",
    headlineAccent: "Leave It Empty.",
    intro:
      "Moving out with furniture, rubbish and odds and ends you don't want to take? We clear rentals across Melbourne before the final inspection, for tenants, landlords and property managers. It's a clear-out, not a clean, so the place is empty and ready for your cleaners.",
    image: "after",
    ctaImage: "teamTrust",
    checklistHeading: "What we take",
    checklist: [
      "Unwanted furniture & mattresses",
      "Rubbish & leftover household items",
      "Items left by previous tenants",
      "Garden & outdoor leftovers",
      "Broken appliances & e-waste",
      "Boxes & packing waste",
    ],
    ecoCallout: {
      heading: "Not Everything Goes to the Tip",
      body: "Usable furniture and household items are set aside for donation where possible, and recyclables are sorted out before the rest is disposed of.",
    },
    seo: {
      title: "End of Lease Clean Outs Melbourne | Blue Line Removals",
      description:
        "Rental clear-outs across Melbourne for tenants, landlords and property managers. Furniture and rubbish removed before the final inspection.",
    },
    ctaHeading: "Final Inspection Coming Up?",
    ctaBody: "Send a few photos for a free, no-obligation quote.",
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

// The two groups on the /services page toggle, in display order. Also
// decides each service page's "Back to Services" link: moving pages go
// back to /services, junk pages to its Junk view. The general Junk Removal
// page is in neither group, so it has no back link.
export const serviceGroups = {
  moving: {
    label: "Moving Services",
    slugs: [
      "home-removals",
      "apartment-unit-moves",
      "office-removals",
      "interstate-removals",
      "packing-unpacking",
      "storage-solutions",
      "specialty-items",
    ],
  },
  junk: {
    label: "Junk Removal",
    slugs: ["furniture-removal", "rubbish-removal", "green-waste-removal", "garage-shed-clear-outs", "end-of-lease-clean-outs"],
  },
} as const;

export type ServiceGroupKey = keyof typeof serviceGroups;

export function backToServicesHref(slug: string) {
  if ((serviceGroups.moving.slugs as readonly string[]).includes(slug)) return "/services";
  if ((serviceGroups.junk.slugs as readonly string[]).includes(slug)) return "/services?type=junk";
  return undefined;
}

export const trustIcons = [
  { icon: "badge-dollar", label: "Upfront Pricing" },
  { icon: "clock", label: "On-Time, Every Time" },
  { icon: "users", label: "Friendly Team" },
  { icon: "recycle", label: "Eco-Friendly Disposal" },
] as const;
