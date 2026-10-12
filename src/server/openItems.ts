// Everything the chatbot / instant-estimate build is still waiting on, in one place, so
// nothing gets skipped. A test (openItems.test.ts) fails if any value in the rate card is left
// null without an item here, and if docs/chatbot-open-items.md doesn't list every item.
//
// Update the status when an answer arrives; delete the item once the answer is in the code.
//
// status:
//  - "asked"    -- in Ayesha's email to Blue Line of 2026-10-12 ("Blue Line Removals chatbot:
//                  pricing confirmation and a few open points"); `ref` is its Part B number
//  - "to_ask"   -- not yet put to Blue Line
//  - "internal" -- a Qamira action or decision, nothing needed from Blue Line
//  - "answered" -- answered, but the code still needs updating

export type OpenItemStatus = "asked" | "to_ask" | "internal" | "answered";

export interface OpenItem {
  id: string;
  topic: "pricing" | "operations" | "legal" | "content" | "website";
  question: string;
  /** What the system does until this is answered. */
  meanwhile: string;
  status: OpenItemStatus;
  /** Where it was asked, e.g. "Email 12 Oct, B1". */
  ref?: string;
  /** Rate-card fields (dot paths) that stay null until this is answered. */
  rateCardPaths?: string[];
}

export const openItems: OpenItem[] = [
  // ------------------------------------------------------------------ asked in the 12 Oct email
  {
    id: "home-size-guide",
    topic: "pricing",
    question: "Home size guide: for studio/1 bed, 2 bed, 3 bed and 4+ bed -- usual truck, movers and typical hours.",
    meanwhile: "No instant estimates -- every request goes to the team.",
    status: "asked",
    ref: "Email 12 Oct, B1",
    rateCardPaths: ["jobSizes.studio_1bed", "jobSizes.2_bed", "jobSizes.3_bed", "jobSizes.4plus_bed"],
  },
  {
    id: "weekend-holiday-surcharge",
    topic: "pricing",
    question: "Is there a surcharge on weekends and public holidays? If so, how much?",
    meanwhile: "Weekend and public-holiday moves go to the team (weekdays are estimated).",
    status: "asked",
    ref: "Email 12 Oct, B2",
    rateCardPaths: ["weekendSurchargePercent", "publicHolidaySurchargePercent"],
  },
  {
    id: "heavy-items",
    topic: "pricing",
    question: "Which items count as heavy ($80)? Are there any items Blue Line won't move?",
    meanwhile: "Heavy items are only captured in the customer's free-text access notes; not priced.",
    status: "asked",
    ref: "Email 12 Oct, B3",
  },
  {
    id: "long-carry-distance",
    topic: "pricing",
    question: "What distance from the parking spot triggers the $40 long-carry charge?",
    meanwhile: "Parking distance is only captured in the access notes; not priced.",
    status: "asked",
    ref: "Email 12 Oct, B4",
  },
  {
    id: "service-area",
    topic: "pricing",
    question: "Furthest pickup from Tarneit and longest move (km) to estimate automatically; a rough list of suburbs/regions covered.",
    meanwhile: "Nothing can be estimated (the engine can't tell if a job is in range).",
    status: "asked",
    ref: "Email 12 Oct, B5",
    rateCardPaths: ["serviceArea.maxPickupFromDepotKm", "serviceArea.maxMoveKm"],
  },
  {
    id: "furniture-wrapping",
    topic: "content",
    question: "Confirm free furniture wrapping on request stays free.",
    meanwhile: "Not mentioned in estimates or by the chat.",
    status: "asked",
    ref: "Email 12 Oct, B6",
  },
  {
    id: "first-order-offer",
    topic: "pricing",
    question: "First-order offer changes from 30% to 10% across website, chatbot and social -- Blue Line to object if they prefer otherwise.",
    meanwhile: "Engine, chat and emails use 10%; the website still says 30% (home.ts x2, faq.ts, Quote.tsx) until Blue Line replies.",
    status: "asked",
    ref: "Email 12 Oct, B7",
  },
  {
    id: "whatsapp-number",
    topic: "operations",
    question: "A WhatsApp Business number to show on the website.",
    meanwhile: "Website shows phone only.",
    status: "asked",
    ref: "Email 12 Oct, B8",
  },
  {
    id: "part-a-confirm",
    topic: "pricing",
    question:
      "Blue Line confirms Part A as written: truck rates, extra mover, 2h minimum, charging from arrival to end of unloading with call-out included, extras, 10% discount then GST, estimate wording.",
    meanwhile: "Part A is in the rate card; card stays 'placeholder' (test figures only).",
    status: "asked",
    ref: "Email 12 Oct, Part A",
  },
  {
    id: "defaults",
    topic: "pricing",
    question: "Defaults unless Blue Line objects: round to nearest $10, estimates valid 10 days, one first-order discount per email or phone.",
    meanwhile: "In use.",
    status: "asked",
    ref: "Email 12 Oct, defaults",
  },

  // ------------------------------------------------------------------ to clarify with Blue Line
  {
    id: "typical-hours-driving",
    topic: "pricing",
    question: "Do the guide's 'typical hours' include driving between the two addresses, or should the real drive time be added?",
    meanwhile: "No estimates until confirmed (ask alongside the B1 answer).",
    status: "to_ask",
    rateCardPaths: ["typicalHoursIncludeDriving"],
  },
  {
    id: "crew-choice-hours",
    topic: "pricing",
    question: "If a customer picks a different truck or more/fewer movers than the guide, should the hours change (e.g. 4 movers finish faster)?",
    meanwhile: "The guide's hours are used whatever truck/crew the customer picks.",
    status: "to_ask",
  },
  {
    id: "access-pricing",
    topic: "pricing",
    question: "Stairs/heavy items/long carry come in as free text and aren't added to the estimate. Should the form ask for counts so they're priced in?",
    meanwhile: "Notes are stored and shown to the team and on the estimate; covered by the estimate wording.",
    status: "to_ask",
  },
  {
    id: "junk-removal-pricing",
    topic: "pricing",
    question: "Junk removal has no rates -- always a personal quote, or is there a price list?",
    meanwhile: "Junk removal always goes to the team.",
    status: "to_ask",
  },
  {
    id: "commercial-moves",
    topic: "pricing",
    question: "Office/commercial moves aren't in the home size guide -- always a personal quote?",
    meanwhile: "Office moves go to the team.",
    status: "to_ask",
  },
  {
    id: "sign-off",
    topic: "pricing",
    question: "Blue Line signs off the complete rate card; then flip its status to 'confirmed'.",
    meanwhile: "Figures only appear in preview test mode and are never emailed to customers.",
    status: "to_ask",
  },
  {
    id: "team-inbox",
    topic: "operations",
    question: "Which Blue Line inbox should receive estimate and hand-off emails (LEAD_TO_EMAIL)?",
    meanwhile: "Team emails go to qamiraconsulting@gmail.com.",
    status: "to_ask",
  },
  {
    id: "whatsapp-alerts",
    topic: "operations",
    question: "For automatic hand-off alerts: is Blue Line on the WhatsApp Business Platform/Cloud API, or only the WhatsApp Business app?",
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
  {
    id: "faq-facts",
    topic: "content",
    question: "Facts the chat may share: insurance cover, deposit/payment terms, cancellation policy, working hours/days.",
    meanwhile: "The chat says it will get the team to confirm and hands over.",
    status: "to_ask",
  },
  {
    id: "privacy-policy",
    topic: "legal",
    question: "Update the privacy policy to name the chat/estimate processors (Anthropic, Google Maps, Resend, Neon) -- reviewed by Irfan or a lawyer before launch.",
    meanwhile: "The chat shows a short collection notice when asking for contact details.",
    status: "to_ask",
  },

  // ------------------------------------------------------------------ Qamira actions / decisions
  {
    id: "estimate-vs-final",
    topic: "website",
    question:
      "The email makes every figure an estimate that 'may vary'; the decision of 6 Oct was a final price with no extra charges, and the website promises flat-rate, no call-out, 'not an hourly meter'. Confirm the switch and update the website copy to match.",
    meanwhile: "Chat and emails say 'estimate' with Blue Line's wording; the website copy is unchanged.",
    status: "internal",
  },
  {
    id: "quote-form-fields",
    topic: "website",
    question:
      "Quote form: home size + optional truck (4.5T / 6-8T / 10T) + 2, 3 or 4 movers + 'let the team inspect' + access notes (the 7 Oct screenshot showed 3.5/4.5/6/8T and 2/4 movers -- the email supersedes it). Also change '30%' and 'final price' wording on the page.",
    meanwhile: "The current form sends home size only, so estimates use the guide's truck and crew.",
    status: "internal",
  },
  {
    id: "hourly-rate-disclosure",
    topic: "pricing",
    question: "Now that figures are estimates based on hours, may the chat or estimate show hourly rates if a customer asks?",
    meanwhile: "Hourly rates are never shown (the chat guard blocks them).",
    status: "internal",
  },
  {
    id: "sending-domain",
    topic: "operations",
    question: "Verify bluelineremovals.com.au in Resend (DNS records via Namecheap) so estimates come from Blue Line's own domain.",
    meanwhile: "Emails send from whatever LEAD_FROM_EMAIL is verified.",
    status: "internal",
  },
  {
    id: "grand-final-eve-2027",
    topic: "pricing",
    question: "Add the 2027 AFL Grand Final eve public holiday once the AFL sets the date.",
    meanwhile: "That date is treated as a normal day.",
    status: "internal",
  },

  // ------------------------------------------------------------------ answered, handled
  {
    id: "piano-packing",
    topic: "pricing",
    question: "Piano is 'from $200' depending on type and access; packing is materials at cost plus hourly labour (email Part A).",
    meanwhile: "Both go to the team for a personal quote; the chat never quotes 'from' prices.",
    status: "answered",
  },
];
