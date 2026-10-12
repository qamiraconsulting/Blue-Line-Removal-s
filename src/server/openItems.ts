// Everything the chatbot / instant-quote build is still waiting on, in one place, so nothing
// gets skipped. A test (openItems.test.ts) fails if any value in the rate card is left null
// without an item here, and if docs/chatbot-open-items.md doesn't list every item.
//
// Update the status when an answer arrives; delete the item once the answer is in the code.
//
// status:
//  - "asked"    -- in Ayesha's email to Blue Line of 2026-10-12 ("Blue Line Removals chatbot:
//                  pricing confirmation and a few open points"), awaiting their reply
//  - "to_ask"   -- not yet put to Blue Line
//  - "internal" -- a Qamira action, nothing needed from Blue Line
//  - "answered" -- answered, but the code still needs updating

export type OpenItemStatus = "asked" | "to_ask" | "internal" | "answered";

export interface OpenItem {
  id: string;
  topic: "pricing" | "operations" | "legal" | "content";
  question: string;
  /** What the system does until this is answered. */
  meanwhile: string;
  status: OpenItemStatus;
  /** Rate-card fields (dot paths) that stay null until this is answered. */
  rateCardPaths?: string[];
}

export const openItems: OpenItem[] = [
  // ------------------------------------------------------------------ pricing
  {
    id: "loading-hours",
    topic: "pricing",
    question: "Loading + unloading hours for a full load of each truck (3.5T, 4.5T, 6.0T, 8.0T) with 2 movers and with 4 movers.",
    meanwhile: "No truck/crew can be priced; every quote goes to the team.",
    status: "asked",
    rateCardPaths: ["3.5T", "4.5T", "6.0T", "8.0T"].flatMap((t) => [`trucks.${t}.labourHours.2`, `trucks.${t}.labourHours.4`]),
  },
  {
    id: "apply-email-rates",
    topic: "pricing",
    question: "Put the rates and details from Ayesha's 12 Oct 2026 email into the rate card (they may differ slightly from the price guide). Needs the email text.",
    meanwhile: "The rate card still holds the price-guide values.",
    status: "internal",
  },
  {
    id: "truck-3.5t-rate",
    topic: "pricing",
    question: "Hourly rate for the 3.5 tonne truck (not on the price guide).",
    meanwhile: "3.5T requests go to the team.",
    status: "asked",
    rateCardPaths: ["trucks.3.5T.hourlyRateAud"],
  },
  {
    id: "truck-rates-confirm",
    topic: "pricing",
    question: "Confirm the hourly rates per truck (4.5T $120, 6.0T and 8.0T both $140 from the guide's '6-8T' line) -- the 2026-10-12 email may differ.",
    meanwhile: "Current guide rates are used (preview/test mode only -- the card is not signed off).",
    status: "asked",
  },
  {
    id: "public-holiday-surcharge",
    topic: "pricing",
    question: "Public-holiday surcharge % (manager: 'need to check with BLR team').",
    meanwhile: "Moves on a listed Victorian public holiday go to the team.",
    status: "asked",
    rateCardPaths: ["publicHolidaySurchargePercent"],
  },
  {
    id: "service-area",
    topic: "pricing",
    question: "Service area: the furthest pickup from the Tarneit depot, and the longest move, that can be priced automatically.",
    meanwhile: "Nothing can be priced (the engine can't tell if a job is in range).",
    status: "asked",
    rateCardPaths: ["serviceArea.maxPickupFromDepotKm", "serviceArea.maxMoveKm"],
  },
  {
    id: "gst-on-discount",
    topic: "pricing",
    question:
      "30% first-move offer and GST: GST on the discounted price ($1,000 job -> $700 + $70 = $770, how GST normally works) or on the full price ($700 + $100 = $800)?",
    meanwhile: "Built as $770 (GST on the discounted price).",
    status: "asked",
  },
  {
    id: "extra-truck-rate",
    topic: "pricing",
    question: "The 'AUD 180 per hour' for an extra truck after inspection: does it include movers, and should it appear on the customer's quote?",
    meanwhile: "Quote says the price can change after the onsite inspection, without showing a rate.",
    status: "asked",
  },
  {
    id: "access-pricing",
    topic: "pricing",
    question: "Access notes (stairs, parking distance, heavy items) are free text and not priced. OK, or should any access note send the quote to the team?",
    meanwhile: "Notes are stored and shown to the team and on the customer's quote; the price ignores them.",
    status: "asked",
  },
  {
    id: "call-out",
    topic: "pricing",
    question: "Confirm call-out is still $60/hr of travel from the Tarneit depot, 1-hour minimum, rounded up (included in the price, never shown).",
    meanwhile: "Uses $60/hr, 1h minimum (confirmed 2026-08-21).",
    status: "to_ask",
  },
  {
    id: "junk-removal-pricing",
    topic: "pricing",
    question: "Junk removal has no rates -- is it always a personal quote, or is there a price list?",
    meanwhile: "Junk removal always goes to the team.",
    status: "to_ask",
  },
  {
    id: "packing",
    topic: "pricing",
    question: "Packing is charged by the hour depending on the job (manager 2026-10-07).",
    meanwhile: "Chat hands packing requests to the team; no instant price.",
    status: "answered",
  },
  {
    id: "rounding-validity",
    topic: "pricing",
    question: "Prices rounded to the nearest $10 and quotes valid for 14 days (proposed, not objected to).",
    meanwhile: "Uses $10 rounding and 14 days.",
    status: "answered",
  },
  {
    id: "grand-final-eve-2027",
    topic: "pricing",
    question: "Add the 2027 AFL Grand Final eve public holiday once the AFL sets the date.",
    meanwhile: "That date is treated as a normal day.",
    status: "internal",
  },
  {
    id: "sign-off",
    topic: "pricing",
    question: "Blue Line signs off the complete rate card; then flip its status to 'confirmed'.",
    meanwhile: "Prices only appear in preview test mode and are never emailed to customers.",
    status: "to_ask",
  },

  // ------------------------------------------------------------------ operations
  {
    id: "team-inbox",
    topic: "operations",
    question: "Which Blue Line inbox should receive quote and hand-off emails (LEAD_TO_EMAIL)?",
    meanwhile: "Team emails go to qamiraconsulting@gmail.com.",
    status: "to_ask",
  },
  {
    id: "sending-domain",
    topic: "operations",
    question: "Verify bluelineremovals.com.au in Resend (DNS records via Namecheap) so customer quotes come from Blue Line's own domain.",
    meanwhile: "Emails send from whatever LEAD_FROM_EMAIL is verified.",
    status: "internal",
  },
  {
    id: "whatsapp-alerts",
    topic: "operations",
    question: "Is Blue Line on the WhatsApp Business Platform/Cloud API (needed for automatic hand-off alerts), or only the WhatsApp Business app?",
    meanwhile: "Hand-offs alert the team by email and appear on the admin dashboard.",
    status: "to_ask",
  },
  {
    id: "admin-users",
    topic: "operations",
    question: "Who at Blue Line needs dashboard access? Each person signs in once, then their Clerk user ID goes in ADMIN_USER_IDS.",
    meanwhile: "Only user IDs listed in ADMIN_USER_IDS can open the dashboard.",
    status: "to_ask",
  },

  // ------------------------------------------------------------------ content / legal
  {
    id: "faq-facts",
    topic: "content",
    question: "Facts the chat may share: insurance cover, deposit/payment terms, cancellation policy, working hours/days, what's not moved.",
    meanwhile: "The chat says it will get the team to confirm and hands over.",
    status: "to_ask",
  },
  {
    id: "privacy-policy",
    topic: "legal",
    question: "Update the privacy policy to name the chat/quote processors (Anthropic, Google Maps, Resend, Neon) -- reviewed by Irfan or a lawyer before launch.",
    meanwhile: "The chat shows a short collection notice when asking for contact details.",
    status: "to_ask",
  },
];
