# Chatbot & instant quote — open items

Everything still needed before the chat and the website form can give real prices.
The source of truth is `src/server/openItems.ts`; a test fails if this page, or the
rate card, falls out of step with it.

**Asked** = in Ayesha's email to Blue Line of 12 October 2026, *"Blue Line Removals chatbot:
pricing confirmation and a few open points"*. Until each answer arrives, the system does what
the "Meanwhile" column says: it never guesses.

## Pricing

| Item | Question | Status | Meanwhile |
|---|---|---|---|
| `loading-hours` | Loading + unloading hours for a full load of each truck (3.5T, 4.5T, 6.0T, 8.0T) with 2 and with 4 movers | Asked | No instant prices — every quote goes to the team |
| `apply-email-rates` | Put the rates from the 12 Oct email into the rate card (may differ slightly from the price guide) | Qamira — needs the email text | Price-guide values in use |
| `truck-3.5t-rate` | Hourly rate for the 3.5 tonne truck | Asked | 3.5T goes to the team |
| `truck-rates-confirm` | Confirm truck rates (4.5T $120; 6.0T and 8.0T $140) — the 12 Oct email may differ | Asked | Guide rates used in preview only |
| `public-holiday-surcharge` | Public-holiday surcharge % | Asked | Public-holiday moves go to the team |
| `service-area` | Furthest pickup from Tarneit, and longest move, to price automatically | Asked | No instant prices |
| `gst-on-discount` | 30% offer: GST on the discounted price ($770 on a $1,000 job) or on the full price ($800)? | Asked | Built as $770 |
| `extra-truck-rate` | "$180/hr" for an extra truck: includes movers? Shown on the quote? | Asked | Quote mentions inspection, no rate |
| `access-pricing` | Free-text access notes are not priced — OK, or send those quotes to the team? | Asked | Notes shown, not priced |
| `call-out` | Call-out still $60/hr from Tarneit, 1-hour minimum, rounded up? | To ask | Uses $60/hr, 1h minimum |
| `junk-removal-pricing` | Junk removal: always a personal quote, or is there a price list? | To ask | Goes to the team |
| `packing` | Packing is by the hour, depends on the job | Answered | Chat hands to the team |
| `rounding-validity` | Round to nearest $10, quotes valid 14 days | Answered | In use |
| `grand-final-eve-2027` | Add the 2027 AFL Grand Final eve holiday once the date is set | Qamira | Treated as a normal day |
| `sign-off` | Blue Line signs off the full rate card (then status → confirmed) | To ask | Test prices only, never emailed |

## Operations

| Item | Question | Status | Meanwhile |
|---|---|---|---|
| `team-inbox` | Which Blue Line inbox receives quote and hand-off emails? | To ask | Goes to qamiraconsulting@gmail.com |
| `sending-domain` | Verify bluelineremovals.com.au in Resend (DNS via Namecheap) | Qamira | Sends from the verified address |
| `whatsapp-alerts` | WhatsApp Business Platform/Cloud API, or just the app? | To ask | Email alerts + dashboard |
| `admin-users` | Who at Blue Line needs dashboard access? | To ask | Only listed user IDs get in |

## Content & legal

| Item | Question | Status | Meanwhile |
|---|---|---|---|
| `faq-facts` | Insurance, deposit/payment, cancellation, working hours, items not moved | To ask | Chat hands to the team |
| `privacy-policy` | Privacy policy names Anthropic, Google Maps, Resend, Neon; reviewed before launch | To ask | Short collection notice in chat |
