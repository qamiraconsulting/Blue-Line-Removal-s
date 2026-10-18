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
    meanwhile: "10% everywhere: engine, chat, emails and website copy (Ayesha confirmed 13 Oct).",
    status: "answered",
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
    id: "booking-terms",
    topic: "legal",
    question:
      "Approve the booking terms the customer agrees to in the chat (bookingEmails.ts BOOKING_TERMS): booking on the estimate, team inspects on the move day before starting and confirms the final charges.",
    meanwhile: "The chat shows the draft terms word for word and stores the exact text each customer agreed to.",
    status: "to_ask",
  },
  {
    id: "capacity-setup",
    topic: "operations",
    question:
      "Blue Line fills in Bookings & capacity on the dashboard: trucks (size each), working days, arrival times offered, end of day, gap between jobs, movers per day, minimum notice, how far ahead, optional instant-confirm limit -- and keeps every phone booking in the calendar. Then decide whether to switch instant confirmation on.",
    meanwhile: "Instant confirmation is off; every chat booking is a request the team confirms on the dashboard.",
    status: "to_ask",
  },
  {
    id: "existing-booking-tool",
    topic: "operations",
    question: "Does Blue Line keep bookings in another calendar or tool today? If so, either enter them on the dashboard too, or we connect to it -- otherwise instant confirmation could double-book.",
    meanwhile: "Only bookings in the dashboard calendar count.",
    status: "to_ask",
  },
  {
    id: "cancellation-policy",
    topic: "legal",
    question: "Deposit and cancellation/rescheduling policy for bookings (needed in the booking terms, especially before instant confirmation).",
    meanwhile: "No deposit is taken; cancellations are handled by phone; the customer isn't emailed when the team cancels.",
    status: "to_ask",
  },
  {
    id: "truck-gps",
    topic: "operations",
    question: "Idea, parked: use the trucks' GPS to know where each truck is (e.g. for travel or same-day slots). Not being explored yet.",
    meanwhile: "Not used.",
    status: "internal",
  },
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
    id: "deposit-terms",
    topic: "legal",
    question: "The $100 deposit (bookings 7+ days ahead): is it taken off the final bill, and is it refundable if the customer cancels or moves the date? (Goes into the booking terms.)",
    meanwhile: "The chat and emails only say a $100 deposit locks the booking in; nothing about refunds or deducting it. Refunds are done by hand in Stripe.",
    status: "to_ask",
  },
  {
    id: "stripe-account",
    topic: "operations",
    question: "Blue Line opens a Stripe account for the $100 deposit (ABN, owner ID check, the BSB and account number payouts go to), requests PayTo under Settings > Payment methods (customers can then pay straight from their bank account), switches on email receipts, and gives Qamira Developer access. Plain bank transfers were dropped (16 Oct): nothing could tell the system they arrived.",
    meanwhile: "Testing with Qamira's own Stripe account in test mode (no real money). Without Stripe keys the customer is told the team will send a payment link.",
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
    id: "call-out-fee",
    topic: "pricing",
    question:
      "Matt's Google Sheet adds a $100 call-out fee to his quotes, but the rate card (12 Oct email, Part A) says the call-out is included in the hourly rate and never charged. Which is right?",
    meanwhile: "Website and chat estimates have no call-out; Matt's quotes keep his sheet's call-out. The same job can be priced differently by channel.",
    status: "to_ask",
  },
  {
    id: "team-inbox",
    topic: "operations",
    question: "Team emails go to hello@bluelineremovals.com.au (Ayesha, 15 Oct). Check LEAD_TO_EMAIL in Vercel is that address or unset.",
    meanwhile: "hello@ is the default in the code; a LEAD_TO_EMAIL set in Vercel overrides it.",
    status: "internal",
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
    meanwhile: "Chat, emails and the quote form's result say 'estimate' with Blue Line's wording; the home page and FAQ copy are unchanged.",
    status: "internal",
  },
  {
    id: "quote-form-fields",
    topic: "website",
    question:
      "Quote form: home size + optional truck (4.5T / 6-8T / 10T) + 2, 3 or 4 movers + 'let the team inspect' + access notes (the 7 Oct screenshot showed 3.5/4.5/6/8T and 2/4 movers -- the email supersedes it). Also change '30%' and 'final price' wording on the page.",
    meanwhile: "The form sends home size + optional notes (added 15 Oct), so estimates use the guide's truck and crew. New Property Size options awaited from Ayesha.",
    status: "internal",
  },
  {
    id: "hourly-rate-disclosure",
    topic: "pricing",
    question: "The branded PDF quote shows the full breakdown incl. rate per hour (Ayesha, 15 Oct). Should the chat also answer hourly-rate questions?",
    meanwhile: "The PDF quote shows rate x hours; the chat itself still never states an hourly rate (the guard blocks it).",
    status: "internal",
  },
  {
    id: "apps-script-pdf",
    topic: "operations",
    question:
      "Add the website additions to the quote Apps Script (docs/apps-script/blr-website-additions.gs), deploy it as a web app, and set APPS_SCRIPT_URL / APPS_SCRIPT_SECRET in Vercel and the Script Properties.",
    meanwhile: "Website and chat customers get their quote as a plain email with the same figures; Matt's Google Form rows don't reach the dashboard.",
    status: "internal",
  },
  {
    id: "pdf-adjustment-row",
    topic: "content",
    question: "Add a 'Discount / adjustment' row ({{Adjustment}}) to the estimate table in BLR_Quote_Template.html, for discounts, rounding and team-set totals.",
    meanwhile: "Without it the PDF's lines may not add up to the total when there's a discount or a team-set total; the email note explains it.",
    status: "internal",
  },
  {
    id: "stripe-setup",
    topic: "operations",
    question: "Stripe for the deposit: add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in Vercel, the webhook endpoint <site>/api/stripe/webhook (checkout.session.completed / async_payment_succeeded / async_payment_failed / expired), and on previews Vercel's Protection Bypass for Automation so Stripe can reach it. Test keys now; Blue Line's live keys at go-live.",
    meanwhile: "No payment page is made; the customer is told the team will send a link and the team email says so.",
    status: "internal",
  },
  {
    id: "driver-details",
    topic: "operations",
    question: "Enter each driver's name, mobile and email under Bookings & capacity > Drivers, and give every truck its usual driver. Drivers are emailed the job (date, time, pick-up, drop-off, customer details) when a booking is confirmed.",
    meanwhile: "A truck with no usual driver, or a driver with no email, means nobody is told; the dashboard says so next to the trip.",
    status: "internal",
  },
  {
    id: "cron-secret",
    topic: "operations",
    question: "Add CRON_SECRET (any long random string) in Vercel for Production. The hourly job (vercel.json) that sends the day-before driver and customer emails needs it, and Vercel only runs cron jobs on the live deployment.",
    meanwhile: "Without it no day-before email is sent on the live site (nothing runs). On the test link use Truck trips > Send due emails now.",
    status: "internal",
  },
  {
    id: "driver-sms",
    topic: "operations",
    question: "Driver and customer notices go by email. If SMS or WhatsApp is wanted as well, pick a provider (an Australian SMS service, or the WhatsApp Business Platform / Cloud API tier) and add drivers' mobile consent.",
    meanwhile: "Email only.",
    status: "internal",
  },
  {
    id: "past-customers",
    topic: "pricing",
    question:
      "Matt's 9 real customers (sheet rows 27 Sep - 7 Oct) were imported on 16 Oct. The sheet has all 9 as 'Not Confirmed', so they're stored as quotes and still count as first-time customers. Did any of them actually move with Blue Line? Those get marked completed.",
    meanwhile: "The 9 show as past quotes (lost); none blocks the 10% first-customer discount.",
    status: "to_ask",
  },
  {
    id: "gtm-chat-events",
    topic: "website",
    question: "Add GTM Custom Event triggers (and GA4 events) for the chat: chat_opened, chat_started, chat_estimate_shown, chat_handoff.",
    meanwhile: "The site pushes the events to the dataLayer; nothing records them until the triggers exist.",
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
