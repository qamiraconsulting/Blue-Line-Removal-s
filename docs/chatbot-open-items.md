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
| `defaults` | Defaults | Round to $10, valid 10 days, one discount per email/phone | In use |

## To clarify with Blue Line (not in the email)

| Item | Question | Meanwhile |
|---|---|---|
| `booking-terms` | Approve the booking terms customers agree to in the chat. 28 Oct: Blue Line's cancellation rule (72 hours, by phone) added; the rest wasn't commented on | Terms shown word for word; exact text stored per booking |
| `typical-hours-driving` | The "typical hours" are to load and unload (25 Oct), so the engine adds the real drive time. Worth a one-line confirmation from Blue Line | Drive time added on top |
| `deposit-terms` | Is the $100 deposit taken off the final bill, and refundable if the customer cancels or moves the date? | Chat only says a $100 deposit locks the booking in; refunds by hand in Stripe |
| `stripe-account` | Blue Line opens a Stripe account (ABN, owner ID, payout BSB + account), requests PayTo, switches on receipts, gives Qamira Developer access. Plain bank transfer dropped (16 Oct) | Testing on Qamira's Stripe test account; no keys = team sends a link |
| `junk-removal-pricing` | Junk removal: always a personal quote, or a price list? | Goes to the team |
| `commercial-moves` | Office moves: always a personal quote? | Goes to the team |
| `whatsapp-alerts` | WhatsApp Business Platform/Cloud API (for automatic alerts), or just the app? | Email alerts + dashboard |
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
| `driver-details` | Enter each driver's name, mobile and email (Settings > Drivers). Drivers are picked per job on Booking and trucks (no usual driver, 28 Oct) | A job with no driver 2 days before the move is flagged red and the team is emailed |
| `cron-secret` | Add CRON_SECRET in Vercel (Production) so the hourly job can send the day-before driver and customer emails | No day-before emails on the live site; on the test link use Send due emails now (Booking and trucks) |
| `quote-form-apartment` | Website form doesn't ask apartment / parking distance per end, so it leaves out the long carry at apartments; add the questions to the form | Only the chat adds the long carry; website apartment estimates are lower |
| `risky-items-note-pdf` | Add the risky/breakable-item note to the PDF quote template and decide on the booking terms | In the estimate email and the chat only |
| `driver-sms` | Optional: SMS / WhatsApp for driver and customer notices | Email only |
| `past-customers` | Matt's 9 real customers imported 16 Oct, all 'Not Confirmed' in his sheet: did any actually move with Blue Line? (Those get marked completed.) | Stored as past quotes; still get the 10% first-customer discount |
| `gtm-chat-events` | Add GTM triggers / GA4 events for chat_opened, chat_started, chat_estimate_shown, chat_handoff | Events pushed to the dataLayer, not yet recorded |
| `sending-domain` | Verify bluelineremovals.com.au in Resend (DNS via Namecheap) | Sends from the verified address |
| `truck-gps` | Idea, parked: use truck GPS (e.g. for travel or same-day slots) | Not used |
| `grand-final-eve-2027` | Add the 2027 AFL Grand Final eve holiday once the date is set | Treated as a normal day |

## Answered and handled

| Item | Answer | Handling |
|---|---|---|
| `heavy-items` | No list: whatever the customer calls heavy counts (Blue Line, 28 Oct) | The chat charges $80 for each heavy item the customer names |
| `whatsapp-number` | Parked by Blue Line (28 Oct), to add later | Phone only on the website |
| `capacity-setup` | 7am to 9pm every day; every booking (manual too) goes in the system (28 Oct) | Settings: start 7:00am every 30 min, finish by 9pm, every day; instant confirmation on |
| `existing-booking-tool` | The team enters every booking, manual ones included (28 Oct) | Only dashboard bookings count |
| `cancellation-policy` | Call at least 72 hours before the move day; by phone only (28 Oct) | In the booking terms, the booked email and the chat |
| `crew-choice-hours` | No crew choice: 4.5T and 6-8T come with 2 movers, 10T with 3 (28 Oct) | Chat offers only those; server refuses others; guide hours used |
| `admin-users` | Full: Irfan, Ayesha, Lovejeet, Lovepreet, Juned. Limited: Matt (no Settings), email to come (28 Oct) | ADMIN_EMAILS / ADMIN_LIMITED_EMAILS in Vercel; server enforces |
| `sign-off` | Blue Line approved the price summary (28 Oct) | Rate card status is "confirmed": real prices. On the test link customer emails still go to the test inbox only |
| `call-out-fee` | No call-out is charged by the chatbot or the website estimate (Ayesha's manager, 28 Oct) | No call-out line or charge; nothing in Settings. Matt's own quotes keep his sheet's call-out |
| `part-a-confirm` | Blue Line accepted Part A (25 Oct); the call-out point is settled (28 Oct) | In the rate card; the final sign-off is `sign-off` |
| `long-carry-distance` | Long carry ($40) always applies at an apartment pick-up and drop-off, and at any end where the truck can't park within 50 m of the door; once per end (Blue Line reply 25 Oct, replaces the 100 m rule of 16 Oct) | The server adds it (chat asks apartment per end and parking over 50 m for houses) |
| `home-size-guide` | Studio/1 bed 4.5T 2 movers 2 h; 2 bed 4.5T 2 movers 3 h; 3 bed 6-8T 2 movers 5 h; 4+ bed 10T 3 movers 7 h -- hours to load and unload (Blue Line reply 25 Oct, B1) | In the rate card; the engine adds the real drive time on top |
| `weekend-holiday-surcharge` | No surcharge on weekends or public holidays (B2) | 0% in the rate card |
| `service-area` | 120 km radius from Tarneit (B5) | Pick-up and move length each limited to 120 km; beyond goes to the team |
| `furniture-wrapping` | Free wrapping of furniture (bubble wrap, shrink wrap, blankets); boxes charged separately (B6) | Chat tells customers |
| `first-order-offer` | First-order offer is 10% everywhere (B7); the website was changed | 10% in engine, chat, emails and website |
| `access-pricing` | Stairs (no lift) and the long carry are priced (Ayesha, 16 Oct) | Asked in the chat and priced from the rate card |
| `apartment-charges` | Apartments have no other extra charges, only stairs and the long carry, which now always applies (Ayesha 16 Oct; Blue Line 25 Oct) | Chat names only those two |
| `parking-unknown` | Customer doesn't know the parking distance (Ayesha, 16 Oct) | Not priced; customer told a long carry over 50 m is charged on the day; team sees "parking distance not known" |
| `piano-packing` | Piano from $200 (type/access); packing = materials at cost + hourly labour | Personal quote from the team |
