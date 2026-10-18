# Chatbot & instant estimate — open items

Everything still needed before the chat and the website form can give real estimates.
The source of truth is `src/server/openItems.ts`; a test fails if this page, or the
rate card, falls out of step with it.

**Asked** = in Ayesha's email to Blue Line of 12 October 2026, *"Blue Line Removals chatbot:
pricing confirmation and a few open points"*. Until each answer arrives, the system does what
the "Meanwhile" column says: it never guesses.

## Asked in the 12 Oct email — waiting on Blue Line

| Item | Ref | Question | Meanwhile |
|---|---|---|---|
| `home-size-guide` | B1 | Usual truck, movers and typical hours for studio/1 bed, 2 bed, 3 bed, 4+ bed | No instant estimates — every request goes to the team |
| `weekend-holiday-surcharge` | B2 | Weekend / public-holiday surcharge, and how much | Weekend and holiday moves go to the team |
| `heavy-items` | B3 | Which items count as heavy ($80); items not moved | Captured in access notes, not priced |
| `service-area` | B5 | Furthest pickup from Tarneit, longest move (km); suburbs/regions covered | No instant estimates |
| `furniture-wrapping` | B6 | Free furniture wrapping on request stays free? | Not mentioned |
| `first-order-offer` | B7 | First-order offer 30% → 10% everywhere | 10% in engine, chat and emails; website still says 30% (home page ×2, FAQ, quote form) |
| `whatsapp-number` | B8 | WhatsApp Business number for the website | Phone only |
| `part-a-confirm` | Part A | Blue Line confirms the rates and rules as written | In the rate card; test figures only |
| `defaults` | Defaults | Round to $10, valid 10 days, one discount per email/phone | In use |

## To clarify with Blue Line (not in the email)

| Item | Question | Meanwhile |
|---|---|---|
| `booking-terms` | Approve the booking terms customers agree to in the chat (book on the estimate; team inspects on the move day and confirms final charges) | Draft terms shown word for word; exact text stored per booking |
| `capacity-setup` | Fill in Bookings & capacity on the dashboard (trucks, working days, arrival times, end of day, gap, movers, notice, days ahead, optional limit), keep phone bookings in the calendar, then decide on instant confirmation | Instant confirmation off; team confirms every booking |
| `existing-booking-tool` | Is there another calendar/tool with bookings today? Enter them on the dashboard or we connect to it | Only dashboard bookings count |
| `cancellation-policy` | Deposit and cancellation/rescheduling policy for the booking terms | No deposit; cancellations by phone |
| `typical-hours-driving` | Do the "typical hours" include driving between addresses? (ask with the B1 answer) | No estimates until confirmed |
| `crew-choice-hours` | If the customer picks a different truck/crew than the guide, do the hours change? | Guide's hours always used |
| `deposit-terms` | Is the $100 deposit taken off the final bill, and refundable if the customer cancels or moves the date? | Chat only says a $100 deposit locks the booking in; refunds by hand in Stripe |
| `stripe-account` | Blue Line opens a Stripe account (ABN, owner ID, payout BSB + account), requests PayTo, switches on receipts, gives Qamira Developer access. Plain bank transfer dropped (16 Oct) | Testing on Qamira's Stripe test account; no keys = team sends a link |
| `junk-removal-pricing` | Junk removal: always a personal quote, or a price list? | Goes to the team |
| `commercial-moves` | Office moves: always a personal quote? | Goes to the team |
| `sign-off` | Blue Line signs off the complete rate card (then status → confirmed) | Test figures only, never emailed |
| `call-out-fee` | Matt's sheet adds a $100 call-out; the rate card says call-out is included, not charged. Which is right? | Website/chat: no call-out; Matt's quotes keep his |
| `whatsapp-alerts` | WhatsApp Business Platform/Cloud API (for automatic alerts), or just the app? | Email alerts + dashboard |
| `admin-users` | Who at Blue Line needs dashboard access? | Only listed user IDs get in |
| `faq-facts` | Insurance, deposit/payment, cancellation, working hours | Chat hands to the team |
| `privacy-policy` | Privacy policy names Anthropic, Google Maps, Resend, Neon; reviewed before launch | Short collection notice in chat |

## Qamira actions and decisions

| Item | Question | Meanwhile |
|---|---|---|
| `team-inbox` | Team emails go to hello@bluelineremovals.com.au (15 Oct) -- check LEAD_TO_EMAIL in Vercel is that or unset | hello@ is the code default |
| `apps-script-pdf` | Add docs/apps-script/blr-website-additions.gs to the quote Apps Script, deploy as web app, set APPS_SCRIPT_URL / APPS_SCRIPT_SECRET | Plain-email quotes; Matt's rows not on the dashboard |
| `pdf-adjustment-row` | Add a 'Discount / adjustment' {{Adjustment}} row to BLR_Quote_Template.html | PDF lines may not add up when there's a discount or a team-set total |
| `estimate-vs-final` | Email makes every figure an estimate that "may vary"; the 6 Oct decision and the website say final/flat price, no call-out, "not an hourly meter". Confirm and update the website copy | Chat and emails say "estimate" |
| `quote-form-fields` | Form: home size + optional truck (4.5T/6-8T/10T) + 2-4 movers + inspect + access notes; new Property Size options (awaited from Ayesha) | Form sends home size + optional notes; result says "estimate" |
| `hourly-rate-disclosure` | The PDF quote shows rate x hours (15 Oct). Should the chat also answer hourly-rate questions? | PDF shows the breakdown; the chat never states a rate |
| `stripe-setup` | Vercel STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET, Stripe webhook to /api/stripe/webhook, Vercel protection bypass on previews; test keys now, live at go-live | No payment page; team sends a link |
| `driver-details` | Enter each driver's name, mobile and email (Bookings & capacity > Drivers) and set every truck's usual driver | Nobody is told about a job on a truck with no driver or a driver with no email; the dashboard flags it |
| `cron-secret` | Add CRON_SECRET in Vercel (Production) so the hourly job can send the day-before driver and customer emails | No day-before emails on the live site; on the test link use Send due emails now |
| `driver-sms` | Optional: SMS / WhatsApp for driver and customer notices | Email only |
| `past-customers` | Matt's 9 real customers imported 16 Oct, all 'Not Confirmed' in his sheet: did any actually move with Blue Line? (Those get marked completed.) | Stored as past quotes; still get the 10% first-customer discount |
| `gtm-chat-events` | Add GTM triggers / GA4 events for chat_opened, chat_started, chat_estimate_shown, chat_handoff | Events pushed to the dataLayer, not yet recorded |
| `sending-domain` | Verify bluelineremovals.com.au in Resend (DNS via Namecheap) | Sends from the verified address |
| `truck-gps` | Idea, parked: use truck GPS (e.g. for travel or same-day slots) | Not used |
| `grand-final-eve-2027` | Add the 2027 AFL Grand Final eve holiday once the date is set | Treated as a normal day |

## Answered and handled

| Item | Answer | Handling |
|---|---|---|
| `long-carry-distance` | Long carry applies over 100 m from the door (Ayesha, 16 Oct) | Asked in the chat and priced ($40) |
| `access-pricing` | Stairs (no lift) and the long carry are priced (Ayesha, 16 Oct) | Asked in the chat and priced from the rate card |
| `apartment-charges` | Apartments have no other extra charges, only stairs and the long carry (Ayesha, 16 Oct) | Chat names only those two |
| `parking-unknown` | Customer doesn't know the parking distance (Ayesha, 16 Oct) | Not priced; customer told a long carry over 100 m is charged on the day; team sees "parking distance not known" |
| `piano-packing` | Piano from $200 (type/access); packing = materials at cost + hourly labour | Personal quote from the team |
