# Chatbot launch day — checklist

Written 1 Nov 2026, after Blue Line's test (no changes), their approval of the booking terms and
privacy policy, and a clean trial merge (main dbc5214 + 26ad90b + this branch: 338 tests, typechecks,
lint and build all pass). About 1 hour, Ayesha and Claude together, on a quiet weekday morning.

**Rule:** nothing goes to `main` without the checkpoint tag and Ayesha's sign-off (step 4).

## Before the day

- [ ] (Ayesha) `ADMIN_LIMITED_EMAILS` = `mattdispatcher123@gmail.com` in Vercel, Production + Preview.
- [ ] (Ayesha) Agree the time with Blue Line; tell Matt his Google Form keeps working as before.
- [ ] (Ayesha) **Ask Blue Line: did they enter any REAL bookings on the test dashboard?** The cleanup
      (step 2) deletes every booking that isn't from Matt's Google Form, so real ones must be listed first.

## Launch

1. **(Claude) Last look at the test link** — chat estimate, dashboard sign-in, `/privacy`.
2. **(Claude, after Ayesha's OK) Delete the test data.** Dry run first, show Ayesha the counts, then
   `--apply` (script: `zz-clean-test-data.mts`, kept in Claude's scratchpad). Keeps Matt's real
   Google Form customers, drivers, trucks, settings and the distance cache; deletes our test quotes,
   bookings, chats and leads (plus Matt-form tests BLR16102614 and BLR25102616). Keep any real
   bookings Blue Line named.
3. **(Claude) Checkpoint tag** on the live `main`: `pre-chatbot-launch`, pushed to GitHub.
4. **(Ayesha) Sign-off** — "go ahead and merge".
5. **(Ayesha, Claude guides) Switch the live email settings** — right before the merge, so the first
   live build uses them. In Vercel → Environment Variables:
   - delete the **Production** `RESEND_API_KEY` row (old key), then edit the **Preview**
     `RESEND_API_KEY` row and tick **Production** too;
   - same for `LEAD_FROM_EMAIL` (live becomes `quotes@bluelineremovals.com.au`).
6. **(Claude) Merge and push `main`.** In the `main` worktree: bring local `main` up to GitHub's
   (dbc5214) keeping 26ad90b on top, then merge `feature/chatbot-mvp`. Conflict recipe (from the trial):
   - `public/llms.txt`, `src/data/content/faq.ts`, `src/data/content/home.ts` → keep **main's**
     ("10% off your first booking, taken off automatically");
   - `api/quote.ts`, `src/pages/Quote.tsx` → keep **this branch's** (it already has main's 10% offer line);
   - `src/lib/analytics.ts` → this branch's list **plus** `"callback_requested"`.
   Run tests + build, then push. Vercel builds the live site (~2 min).
7. **(Claude) Check the live site:** `https://www.bluelineremovals.com.au/api/health` shows
   `environment: production`, database ok, email true, chatAssistant true, adminDashboard true,
   rateCard confirmed, testPrices false. Home, `/quote`, `/privacy` load.
8. **(Claude, Ayesha's OK) Point Matt's Google Form at the live site:** Apps Script → Project
   Settings → Script properties → `BLR_INTAKE_URL` = `https://www.bluelineremovals.com.au/api/intake`.
9. **(Ayesha + Claude) Soft launch** — the chat only shows with `?chat=1`:
   - `https://www.bluelineremovals.com.au/?chat=1` → a real estimate; a booking request → team email
     arrives at hello@ from quotes@bluelineremovals.com.au;
   - everyone signs in once at `https://www.bluelineremovals.com.au/admin` (live login is new);
     Matt sees no Settings.
10. **(Ayesha) Turn the chat on for everyone:** Vercel → `VITE_CHAT_MODE` (Production) = `on`, then
    Deployments → the newest **Production** row → ⋯ → Redeploy.
11. **(Both) Watch the first chats and bookings** on the dashboard for an hour or so.

## After launch

- Turn off the Vercel share link for the test link (Deployment → Share).
- Day-before driver/customer emails run hourly on the live site (`CRON_SECRET` is set).
- Optional: Upstash spam protection, GA4 chat events, rename the PDF's "Stairs" line.

## If something goes wrong

- **Hide the chat at once:** `VITE_CHAT_MODE` = `off` (Production) → redeploy the latest Production row.
- **Roll the whole site back:** Vercel → Deployments → the last Production deployment before the
  merge (dbc5214) → ⋯ → **Instant Rollback**. Then set `BLR_INTAKE_URL` back to the test link if Matt's
  form rows should keep going there.
