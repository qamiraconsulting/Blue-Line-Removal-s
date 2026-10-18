// Sets up ONE clearly-labelled test booking so the Stripe deposit flow can be tried end to end
// (pay with a Stripe TEST card -> the booking confirms itself), then removes it afterwards.
//
//   node scripts/test-deposit-booking.mjs --email you@example.com            dry run: shows what it would do
//   node scripts/test-deposit-booking.mjs --email you@example.com --apply    creates it
//   node scripts/test-deposit-booking.mjs --remove                           deletes the test booking
//   node scripts/test-deposit-booking.mjs --remove --remove-settings         ... and the test calendar settings
//
// What --apply adds (only ever INSERTs; never changes or deletes anything that exists):
//  - a test estimate "BLR-TEST-DEPOSIT" for a move 10 days from now (a Mon-Sat), $480, 6-8T truck,
//    2 movers, 3 hours, marked as a TEST PRICE so it is never emailed to a real customer;
//  - temporary calendar settings (Mon-Sat, arrivals 7:30 and 12:00, day ends 6pm), ONLY if the
//    team hasn't saved any yet. Blue Line's own settings are never overwritten.
// It prints the one command to paste in the browser console to turn the estimate into a booking
// request (that is what creates the Stripe payment page).
//
// Safe by design: refuses unless connected to blr_chatbot; connection strings are never printed.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  /* checked below */
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const REFERENCE = "BLR-TEST-DEPOSIT";
const expectedDb = process.env.BLR_DB_NAME || "blr_chatbot";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const stop = (m) => {
  console.error(`\n  STOPPED: ${m}\n`);
  process.exit(1);
};
if (!url) stop("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set in .env.");

const sql = postgres(url, { max: 1, onnotice: () => {} });

/** Today's date in Melbourne, plus n days, as YYYY-MM-DD (skipping to Monday if it lands on a Sunday). */
function melbourneDatePlus(n) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  if (t.getUTCDay() === 0) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

try {
  const [{ db }] = await sql`select current_database() as db`;
  if (db !== expectedDb) stop(`connected to "${db}", expected "${expectedDb}".`);

  // ------------------------------------------------------------------ remove
  if (flag("--remove")) {
    const bookingRows = await sql`delete from bookings where quote_reference = ${REFERENCE} returning id`;
    const quoteRows = await sql`delete from quotes where reference = ${REFERENCE} returning reference`;
    console.log(`  Removed ${quoteRows.length} test estimate and ${bookingRows.length} calendar booking(s).`);
    if (flag("--remove-settings")) {
      const s = await sql`delete from booking_settings where id = 1 and updated_by = 'test-deposit-script' returning id`;
      console.log(s.length ? "  Removed the temporary calendar settings." : "  No temporary calendar settings to remove (the team's own settings are never deleted).");
    }
    process.exit(0);
  }

  // ------------------------------------------------------------------ create
  const email = value("--email");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) stop("Add --email you@example.com (an inbox you can open).");
  const apply = flag("--apply");

  const existing = await sql`select reference from quotes where reference = ${REFERENCE}`;
  if (existing.length) stop(`${REFERENCE} already exists. Run with --remove first.`);

  const settings = await sql`select id, updated_by from booking_settings where id = 1`;
  const trucks = await sql`select truck_type from trucks where active = true and truck_type = '6-8T'`;
  const movingDate = melbourneDatePlus(10);
  const validUntil = melbourneDatePlus(14);
  const token = randomBytes(16).toString("hex");

  console.log(`  Database: ${db} (ok)`);
  console.log(`  Test estimate: ${REFERENCE}, move on ${movingDate}, $480, 6-8T truck, 2 movers, arrival 07:30`);
  console.log(settings.length ? "  Calendar settings: the team's own settings already exist -- left alone." : "  Calendar settings: none saved yet -- would add temporary ones (Mon-Sat, 07:30 + 12:00, ends 18:00).");
  if (!trucks.length) console.log("  WARNING: no active 6-8T truck in Bookings & capacity -- a paid deposit would go to the team instead of confirming itself.");

  if (!apply) {
    console.log("\n  Dry run -- nothing changed. Add --apply to create it.");
    process.exit(0);
  }

  if (!settings.length) {
    await sql`insert into booking_settings (id, auto_confirm, working_days, arrival_times, day_end_time, buffer_minutes, movers_per_day, min_notice_hours, max_days_ahead, updated_by)
              values (1, false, ${sql.json([1, 2, 3, 4, 5, 6])}, ${sql.json(["07:30", "12:00"])}, '18:00', 30, 4, 24, 60, 'test-deposit-script')`;
  }

  // The same numbers the engine would store for: 6-8T at $145/hr ex GST x 3 h, GST added, rounded to $10.
  const internal = {
    truck: "6-8T",
    movers: 2,
    capacityFrom: "guide",
    jobHours: 3,
    crewRateAudPerHour: 145,
    labourCostAud: 435,
    accessCostAud: 0,
    surchargeAppliedPercent: 0,
    subtotalAud: 435,
    discountPercent: 0,
    discountAud: 0,
    gstAud: 43.5,
    unroundedAud: 478.5,
  };
  const card = {
    version: "test-deposit-card",
    status: "placeholder",
    trucks: { "4.5T": { label: "4.5 tonne truck", hourlyRateAud: 130 }, "6-8T": { label: "6-8 tonne truck", hourlyRateAud: 145 }, "10T": { label: "10 tonne truck", hourlyRateAud: 185 } },
    gst: { ratesIncludeGst: false, ratePercent: 10 },
  };

  await sql`insert into quotes (reference, source, status, job_status, customer_name, phone, email, email_normalised, phone_normalised, need,
              property_size, moving_date, from_text, to_text, amount_aud, valid_until, rate_card_version, rate_card_status,
              inputs, internal_breakdown, rate_card_snapshot, booking_token)
            values (${REFERENCE}, 'quote_form', 'priced', 'estimate_sent', 'Test Customer (deposit test)', '0400 000 000', ${email}, ${email.toLowerCase()}, '0400000000', 'moving',
              '2_bed', ${movingDate}, '1 Test Street, Preston VIC 3072', '2 Test Road, Brunswick VIC 3056', 480, ${validUntil}, 'test-deposit-card', 'placeholder',
              ${sql.json({ test: true })}, ${sql.json(internal)}, ${sql.json(card)}, ${token})`;

  console.log("\n  Created. Next: open your TEST LINK site, then in the browser console (F12 -> Console) paste:\n");
  console.log(
    `fetch("/api/booking",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference:"${REFERENCE}",token:"${token}",agreedToTerms:true,arrivalTime:"07:30",notes:"Stripe deposit test"})}).then(r=>r.json()).then(console.log)\n`,
  );
  console.log("  It prints a result with deposit.paymentLink -- that is the Stripe payment page.");
  console.log("  When finished: node scripts/test-deposit-booking.mjs --remove --remove-settings");
} catch (err) {
  stop(err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]") : String(err));
} finally {
  await sql.end({ timeout: 5 });
}
