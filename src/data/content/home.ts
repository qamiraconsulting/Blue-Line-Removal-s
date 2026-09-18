// Homepage copy for Blue Line Removals (brand confirmed 2026-07-23).
// 2026-08-10 pass: hero/trustStats/servicesOverview rewritten to match the
// client-supplied sample site pages verbatim (see BLR Sample Site-Lovejeet
// screenshots). Client confirmed the "8+ years / 11,000+ moves / 5,000+
// customers / 100% insured" stats below are real and OK to publish as-is.
// The full 7-service catalog (used on /services and /services/:slug) now
// lives in data/content/services.ts, not here.
export const hero = {
  heading: "Beyond Boxes, We Move Memories.",
  headingAccent: "Memories.",
  lede: "Moving & Junk Removal Services Across Australia.",
  primaryCta: { label: "Get a Free Quote", href: "/quote" },
  // Hero-only click-to-call, requested 2026-09-18 -- note this is a
  // deliberate exception to the 2026-08-15 "no phone number published
  // site-wide" decision (see site.ts), not a reversal of it.
  phone: { display: "02 9056 0928", href: "tel:+61290560928" },
};

// "We Don't Just Move Furniture" trust intro, sitting right under the hero
// area (2026-08-13, from client-supplied reference screenshot of the
// sample site). Copy transcribed verbatim from that reference.
export const trustIntro = {
  eyebrow: "A Moving Company You Can Trust",
  heading: "We Don't Just Move Furniture. We Move Lives.",
  headingAccent: "We Move Lives.",
  body: [
    "We know that every home has a story. That's why we treat every move with the care, respect and attention it deserves.",
    "With 8+ years of experience and over 11,000 successful moves, families and individuals across Melbourne trust Blue Line Removals to move what matters most.",
  ],
  signature: "The Blue Line Removals Team",
};

// New-customer / seasonal discount hook, carried over from the pre-sample
// build (2026-07-23 decision). Not part of the sample's hero -- surfaced
// instead on the Quote page so it isn't lost. Update or retire seasonally.
export const promo = {
  badge: "New Customer Offer",
  heading: "30% off your first move",
  body: "Book your first move or junk removal with Blue Line Removals and save 30% off the flat-rate quote — just note it on the form.",
};

export const trustStats = [
  { icon: "award", value: "8+", label: "Years of Experience" },
  { icon: "truck", value: "11,000+", label: "Successful Moves" },
  { icon: "users", value: "5,000+", label: "Happy Customers" },
  { icon: "shield", value: "100%", label: "Fully Insured" },
] as const;

// Homepage "Two Services. One Trusted Team." section (2026-08-12, from
// client-supplied reference screenshot of the sample site's services
// block). Each category card lists 5 sub-services -- the Moving items map
// to existing /services/:slug pages where one exists (Apartment & Unit
// Moves doesn't have its own page yet, so it links to the /services list).
// The Junk Removal sub-items are a new, more granular breakdown than the
// single junk-removal page's own checklist in data/content/services.ts --
// "Rubbish Removal" and "End of Lease Clean Outs" are new here, straight
// from the client's reference image.
export const servicesDetailed = {
  eyebrow: "What We Do",
  heading: "Two Services. One Trusted Team.",
  body: "Whether you're moving to a new home or clearing out unwanted items, Blue Line Removals is here to make it easy.",
  categories: [
    {
      key: "moving",
      accent: "navy" as const,
      badge: "Moving Services",
      title: "Moving Made Easy.",
      body: "From start to finish, we handle your move with care, professionalism and experience.",
      image: "homeRemovals" as const,
      cta: { label: "Explore Moving Services", href: "/services" },
      items: [
        { icon: "home", title: "Home Removals", body: "Moving to a new home? We'll take care of everything.", href: "/services/home-removals" },
        { icon: "apartment", title: "Apartment & Unit Moves", body: "Perfect for apartments, townhouses and high-rise living.", href: "/services" },
        { icon: "building", title: "Office & Commercial Moves", body: "Minimise disruption and keep your business moving.", href: "/services/office-removals" },
        { icon: "package", title: "Packing & Unpacking", body: "Professional packing to protect what matters most.", href: "/services/packing-unpacking" },
        { icon: "truck", title: "Local & Interstate Moves", body: "Moving across town or across the country, we've got you covered.", href: "/services/interstate-removals" },
      ],
    },
    {
      key: "junk",
      accent: "action" as const,
      badge: "Junk Removal",
      title: "Junk Gone. Space Won.",
      body: "We remove the unwanted so you can enjoy a clean, clutter-free space.",
      image: "junkRemoval" as const,
      cta: { label: "Explore Junk Removal", href: "/services/junk-removal" },
      items: [
        { icon: "armchair", title: "Furniture Removal", body: "Old furniture taking up space? We'll take it away.", href: "/services/junk-removal" },
        { icon: "trash", title: "Rubbish Removal", body: "General rubbish, household waste and clutter — gone.", href: "/services/junk-removal" },
        { icon: "leaf", title: "Green Waste Removal", body: "Garden waste, branches, leaves and more.", href: "/services/junk-removal" },
        { icon: "warehouse", title: "Garage & Shed Clear Outs", body: "Clear the clutter and get your space back.", href: "/services/junk-removal" },
        { icon: "key", title: "End of Lease Clean Outs", body: "We help real estate agents, tenants and landlords.", href: "/services/junk-removal" },
      ],
    },
  ],
};

// Navy stats strip shown right under the services cards, matching the
// reference -- distinct from `trustStats` above (drops "Happy Customers"
// for a "Servicing" line and loses the "100%" prefix on Insured).
export const servicesStats = [
  { icon: "users", value: "8+", label: "Years Experience" },
  { icon: "package", value: "11,000+", label: "Moves Completed" },
  { icon: "shield", value: "Fully", label: "Insured" },
  { icon: "map-pin", value: "Servicing", label: "Melbourne & Surrounding Areas" },
] as const;

export const howItWorks = [
  {
    step: "01",
    title: "Tell us what's going on",
    body: "Email a few photos or fill in the quote form. Junk pile, a whole house move, or both — either way you'll get a straight answer, not a guess.",
  },
  {
    step: "02",
    title: "Get a flat-rate quote",
    body: "No call-out fee to find out the price. We quote by the job, not the hour, so there's no surprise number at the end.",
  },
  {
    step: "03",
    title: "Lock in a time",
    body: "Same-day slots most days, or book ahead for moving day. We turn up when we say we will.",
  },
  {
    step: "04",
    title: "We do the heavy lifting",
    body: "Moves get loaded, driven, and unloaded with care. Anything you're not taking gets sorted — donated or recycled first, landfill last.",
  },
];

export const beforeAfter = {
  eyebrow: "Kind to Melbourne, not just your garage",
  heading: "We sort it before we dump it — nature doesn't need more landfill.",
  body: "Most junk-removal outfits take everything straight to landfill. Blue Line Removals separates what can be donated or recycled first — furniture to charity, metal and e-waste to recyclers — because protecting the environment isn't an afterthought here, it's how every job is run.",
  beforeLabel: "Before — the job we get called for",
  afterLabel: "After — cleared, sorted, done",
};

export const whyUs = [
  {
    title: "Licensed & Insured",
    body: "Every job is covered — public liability and goods-in-transit insurance, so your property (and ours) is protected.",
  },
  {
    title: "Same-Day Availability",
    body: "Most jobs can be booked and cleared the same day. If it's urgent, just say so on the quote form.",
  },
  {
    title: "Upfront, Flat-Rate Pricing",
    body: "You get a price before we start, not an hourly meter running while we work. What we quote is what you pay.",
  },
  {
    title: "Donate & Recycle First",
    body: "Landfill is the last resort, never the first. We're committed to keeping usable furniture and recyclable materials out of it — reused, donated, or recycled wherever Melbourne's facilities allow.",
  },
];

// Placeholder layout only -- JDcorp hasn't taken its first job yet, so
// there are no real reviews to show. Replace every card with an actual
// Google review (and turn on the review-request flow from the roadmap)
// once jobs start coming in. Do not ship this section with invented quotes
// attributed to real-looking names.
export const reviews = {
  eyebrow: "Reviews",
  heading: "This is where your Google reviews will go",
  body: "This section is built and ready — as soon as the first few jobs are done, swap these placeholders for real reviews (star rating + quote + first name is plenty).",
  placeholders: [
    "Sample review slot — swap for a real 5-star Google review after your first completed job.",
    "Sample review slot — swap for a real 5-star Google review after your first completed job.",
    "Sample review slot — swap for a real 5-star Google review after your first completed job.",
  ],
};

// Homepage's closing section -- the full quote form now lives on its own
// page (/quote, see pages/Quote.tsx), so this is a short CTA banner rather
// than an embedded form.
export const quoteCta = {
  eyebrow: "Get a quote",
  heading: "Tell us what needs to go — or where it needs to go.",
  body: "Get a free, no-obligation quote in minutes. First move or first junk pickup with us? Ask about the 30% new-customer offer. Same-day slots fill up fast, so the earlier in the day you reach out, the more likely we can fit you in today.",
  cta: { label: "Get My Free Quote", href: "/quote" },
};
