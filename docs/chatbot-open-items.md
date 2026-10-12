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
| `long-carry-distance` | B4 | Distance from parking that triggers the $40 long carry | Captured in access notes, not priced |
| `service-area` | B5 | Furthest pickup from Tarneit, longest move (km); suburbs/regions covered | No instant estimates |
| `furniture-wrapping` | B6 | Free furniture wrapping on request stays free? | Not mentioned |
| `first-order-offer` | B7 | First-order offer 30% → 10% everywhere | 10% in engine, chat and emails; website still says 30% (home page ×2, FAQ, quote form) |
| `whatsapp-number` | B8 | WhatsApp Business number for the website | Phone only |
| `part-a-confirm` | Part A | Blue Line confirms the rates and rules as written | In the rate card; test figures only |
| `defaults` | Defaults | Round to $10, valid 10 days, one discount per email/phone | In use |

## To clarify with Blue Line (not in the email)

| Item | Question | Meanwhile |
|---|---|---|
| `typical-hours-driving` | Do the "typical hours" include driving between addresses? (ask with the B1 answer) | No estimates until confirmed |
| `crew-choice-hours` | If the customer picks a different truck/crew than the guide, do the hours change? | Guide's hours always used |
| `access-pricing` | Should the form ask for counts of stairs/heavy items so they're priced in? | Notes shown, not priced |
| `junk-removal-pricing` | Junk removal: always a personal quote, or a price list? | Goes to the team |
| `commercial-moves` | Office moves: always a personal quote? | Goes to the team |
| `sign-off` | Blue Line signs off the complete rate card (then status → confirmed) | Test figures only, never emailed |
| `team-inbox` | Which Blue Line inbox receives estimate and hand-off emails? | qamiraconsulting@gmail.com |
| `whatsapp-alerts` | WhatsApp Business Platform/Cloud API (for automatic alerts), or just the app? | Email alerts + dashboard |
| `admin-users` | Who at Blue Line needs dashboard access? | Only listed user IDs get in |
| `faq-facts` | Insurance, deposit/payment, cancellation, working hours | Chat hands to the team |
| `privacy-policy` | Privacy policy names Anthropic, Google Maps, Resend, Neon; reviewed before launch | Short collection notice in chat |

## Qamira actions and decisions

| Item | Question | Meanwhile |
|---|---|---|
| `estimate-vs-final` | Email makes every figure an estimate that "may vary"; the 6 Oct decision and the website say final/flat price, no call-out, "not an hourly meter". Confirm and update the website copy | Chat and emails say "estimate" |
| `quote-form-fields` | Form: home size + optional truck (4.5T/6-8T/10T) + 2-4 movers + inspect + access notes; fix "30%" and "final price" wording | Form sends home size only |
| `hourly-rate-disclosure` | May hourly rates be shown if a customer asks, now that figures are estimates? | Never shown |
| `sending-domain` | Verify bluelineremovals.com.au in Resend (DNS via Namecheap) | Sends from the verified address |
| `grand-final-eve-2027` | Add the 2027 AFL Grand Final eve holiday once the date is set | Treated as a normal day |

## Answered and handled

| Item | Answer | Handling |
|---|---|---|
| `piano-packing` | Piano from $200 (type/access); packing = materials at cost + hourly labour | Personal quote from the team |
