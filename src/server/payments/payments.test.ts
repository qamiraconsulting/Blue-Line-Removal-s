import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BookingStore, StoredQuote } from "../quote/booking.js";
import { fixtureRateCard } from "../quote/rateCard.fixture.js";
import type { OutgoingEmail } from "../quote/service.js";
import { depositCheckoutFor, siteUrlFrom, type DepositPaid, type DepositStore } from "./depositPayment.js";
import { handleStripeEvent } from "./depositWebhook.js";
import { createDepositCheckout, isTestKey, stripeConfigFrom, verifyStripeSignature, type CheckoutSessionEvent } from "./stripe.js";

const SECRET = "whsec_test_secret";
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("Stripe signature check", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;

  it("accepts Stripe's signature over the exact body", () => {
    expect(verifyStripeSignature(body, sign(body, now), SECRET, now)).toBe(true);
    // Several v1 signatures (during a secret roll): one matching is enough.
    expect(verifyStripeSignature(body, `${sign(body, now, "whsec_old")},v1=${sign(body, now).split("v1=")[1]}`, SECRET, now)).toBe(true);
  });

  it("rejects a changed body, the wrong secret, an old message, or no header", () => {
    expect(verifyStripeSignature(body.replace("evt_1", "evt_2"), sign(body, now), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now, "whsec_other"), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now - 301), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc,v1=zz", SECRET, now)).toBe(false);
  });
});

describe("Stripe setup", () => {
  it("needs both keys; knows test keys from live ones", () => {
    expect(stripeConfigFrom({ STRIPE_SECRET_KEY: "sk_test_1" })).toBeNull();
    expect(stripeConfigFrom({ STRIPE_SECRET_KEY: " rk_test_1 ", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toEqual({ secretKey: "rk_test_1", webhookSecret: "whsec_1" });
    expect([isTestKey("sk_test_1"), isTestKey("rk_test_1"), isTestKey("sk_live_1"), isTestKey("rk_live_1")]).toEqual([true, true, false, false]);
  });

  it("sends customers back to SITE_URL, else this deployment", () => {
    expect(siteUrlFrom({ SITE_URL: "https://www.bluelineremovals.com.au" })).toBe("https://www.bluelineremovals.com.au");
    expect(siteUrlFrom({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "blr-git-x.vercel.app" })).toBe("https://blr-git-x.vercel.app");
    expect(siteUrlFrom({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "blr.com.au", VERCEL_BRANCH_URL: "x" })).toBe("https://blr.com.au");
    expect(siteUrlFrom({})).toBe("http://localhost:5173");
  });

  it("asks Stripe for a $100 AUD page tagged with the booking, safe to retry", async () => {
    let sent: { url: string; headers: Record<string, string>; body: string } | null = null;
    const out = await createDepositCheckout(
      { reference: "BLR-1", amountCents: 10000, customerEmail: "jane@example.com", successUrl: "https://s/ok", cancelUrl: "https://s/back", expiresAt: 1_800_086_340, description: "d" },
      { secretKey: "sk_test_abc" },
      async (url, init) => {
        sent = { url, headers: init.headers, body: init.body };
        return { ok: true, status: 200, json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expires_at: 1_800_086_340 }) };
      },
    );
    expect(out).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expiresAt: 1_800_086_340 });
    const form = new URLSearchParams(sent!.body);
    expect(sent!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(sent!.headers).toMatchObject({ Authorization: "Bearer sk_test_abc", "Idempotency-Key": "deposit-BLR-1-1800086340" });
    expect(Object.fromEntries(form)).toMatchObject({
      mode: "payment",
      "line_items[0][price_data][currency]": "aud",
      "line_items[0][price_data][unit_amount]": "10000",
      client_reference_id: "BLR-1",
      "metadata[reference]": "BLR-1",
      customer_email: "jane@example.com",
      expires_at: "1800086340",
    });
    // Payment methods come from the Stripe dashboard (card, PayTo...), not the code.
    expect(form.has("payment_method_types[0]")).toBe(false);
  });

  it("an error from Stripe never shows the key", async () => {
    const fail = createDepositCheckout(
      { reference: "BLR-1", amountCents: 10000, customerEmail: "a@b.c", successUrl: "https://s", cancelUrl: "https://s", expiresAt: 1, description: "d" },
      { secretKey: "sk_test_SECRET" },
      async () => ({ ok: false, status: 401, json: async () => ({ error: { type: "invalid_request_error" } }) }),
    );
    await expect(fail).rejects.toThrow(/401 invalid_request_error/);
    await expect(fail).rejects.not.toThrow(/SECRET/);
  });

  it("without Stripe set up there's no link (the team sends one)", async () => {
    expect(await depositCheckoutFor({ reference: "R", email: "e", movingDate: null, depositStatus: null, depositCheckoutUrl: null, depositCheckoutExpiresAt: null }, undefined, new Date())).toBeNull();
  });
});

// ------------------------------------------------------------------ Stripe's messages

const quoteRow = (over: Partial<StoredQuote> = {}): StoredQuote =>
  ({
    reference: "BLR-20261012-ABC123",
    conversationId: "conv-1",
    source: "chatbot",
    customerName: "Jane Smith",
    phone: "0412 345 678",
    email: "jane@example.com",
    movingDate: "2026-10-21",
    bookingStatus: "requested",
    bookingArrivalTime: "07:30",
    rateCardStatus: "confirmed",
    depositStatus: "awaiting_payment",
    ...over,
  }) as StoredQuote;

function harness(q: StoredQuote | null, confirmable = true, gate?: Promise<void>) {
  const sent: OutgoingEmail[] = [];
  const calendar: unknown[] = [];
  const notes: string[] = [];
  const paid: DepositPaid[] = [];
  const state = { status: q?.depositStatus ?? null, checkoutId: "cs_1", booked: false };
  const depositStore: DepositStore = {
    saveCheckout: async () => undefined,
    markProcessing: async () => {
      state.status = "processing";
    },
    markPaid: async (_ref, p) => {
      if (state.status === "paid") return false;
      state.status = "paid";
      paid.push(p);
      return true;
    },
    markEnded: async (_ref, id, status) => {
      if (id !== state.checkoutId || !["awaiting_payment", "processing"].includes(state.status ?? "")) return false;
      state.status = status;
      return true;
    },
  };
  // Calendar stand-in: confirm succeeds only when `confirmable` (the slot logic itself is
  // covered in booking.test.ts) -- here, with no arrival times set up it goes to the team.
  const bookings: BookingStore = {
    findQuote: async (ref) => (q && q.reference === ref ? { ...q, bookingStatus: state.booked ? "confirmed" : q.bookingStatus } : null),
    markRequested: async () => false,
    loadCapacity: async () => ({
      settings: { autoConfirm: false, workingDays: confirmable ? [0, 1, 2, 3, 4, 5, 6] : [], arrivalTimes: confirmable ? ["07:30"] : [], dayEndTime: "18:00", bufferMinutes: 0, moversPerDay: 4, minNoticeHours: 0, maxDaysAhead: 365, autoConfirmMaxAud: null },
      trucks: [{ id: "truck-a", truckType: "6-8T", active: true }],
      override: null,
      bookings: [],
    }),
    confirm: async (_ref, _date, decide) => {
      const capacity = await bookings.loadCapacity("");
      // Check-then-set with nothing awaited in between: the real store does this under a lock
      // on the date, so two deliveries at once can never both confirm.
      if (state.booked) return null;
      const d = decide(capacity);
      if (!d) return null;
      state.booked = true;
      calendar.push(d.booking);
      return d.result;
    },
  };
  const deps = {
    bookings,
    depositStore,
    // `gate` makes the emails slow (like the ~15 s PDF), so tests can see what happens meanwhile.
    sendEmail: async (e: OutgoingEmail) => {
      await gate;
      sent.push(e);
      return true;
    },
    teamEmail: "team@example.com",
    customerReplyTo: "hello@example.com",
    chatNote: async (_id: string, text: string) => void notes.push(text),
    now: () => new Date("2026-10-12T02:00:00Z"),
  };
  return { deps, sent, notes, paid, state, calendar };
}

/** A priced estimate that can really be booked: Wed 21 Oct, 07:30, 6-8T, 2 movers, 4.5 h. */
const bookableRow = (over: Partial<StoredQuote> = {}) =>
  quoteRow({
    status: "priced",
    amountAud: 720,
    validUntil: "2026-10-22",
    internalBreakdown: { truck: "6-8T", movers: 2, jobHours: 4.5, crewRateAudPerHour: 140, labourCostAud: 630, accessCostAud: 0 },
    rateCardSnapshot: fixtureRateCard,
    ...over,
  } as Partial<StoredQuote>);

const event = (type: string, object: Partial<CheckoutSessionEvent["data"]["object"]> = {}, livemode = false): CheckoutSessionEvent => ({
  id: "evt_1",
  type,
  livemode,
  data: { object: { id: "cs_1", object: "checkout.session", metadata: { reference: "BLR-20261012-ABC123" }, amount_total: 10000, currency: "aud", payment_status: "paid", payment_intent: "pi_1", ...object } },
});

describe("Stripe says the deposit is paid", () => {
  it("card: records it once and (with no estimate breakdown here) emails the team to confirm", async () => {
    const h = harness(quoteRow());
    expect(await handleStripeEvent(event("checkout.session.completed"), h.deps)).toBe("needs_team");
    expect(h.paid).toEqual([{ checkoutId: "cs_1", amountCents: 10000, paymentIntentId: "pi_1", method: "card", testMode: true }]);
    const team = h.sent.find((e) => e.kind === "team")!;
    expect(team.subject).toContain("ACTION NEEDED -- deposit paid, booking not confirmed");
    expect(team.subject).toContain("[TEST]");
    expect(h.notes[0]).toContain("we've received your $100 deposit");
    // Stripe sends it again while the booking is still unconfirmed: the payment is NOT recorded
    // twice, but the confirmation is tried again (and the team is told again why it can't be done).
    expect(await handleStripeEvent(event("checkout.session.completed"), h.deps)).toBe("needs_team");
    expect(h.paid).toHaveLength(1);
    expect(h.sent).toHaveLength(2);
  });

  it("bank (PayTo): waits while it's processing, then records it as a bank payment", async () => {
    const h = harness(quoteRow());
    expect(await handleStripeEvent(event("checkout.session.completed", { payment_status: "unpaid" }), h.deps)).toBe("processing");
    expect(h.state.status).toBe("processing");
    expect(h.sent).toHaveLength(0);
    await handleStripeEvent(event("checkout.session.async_payment_succeeded"), h.deps);
    expect(h.paid[0]).toMatchObject({ method: "bank (PayTo)" });
  });

  it("the wrong amount is never treated as the deposit", async () => {
    const h = harness(quoteRow());
    expect(await handleStripeEvent(event("checkout.session.completed", { amount_total: 500 }), h.deps)).toBe("needs_team");
    expect(h.sent[0]!.text).toContain("not the $100 deposit");
  });

  it("ignores payments that aren't for a booking, other event types, and unknown references", async () => {
    const h = harness(quoteRow());
    expect(await handleStripeEvent(event("checkout.session.completed", { metadata: {}, client_reference_id: null }), h.deps)).toBe("not_ours");
    expect(await handleStripeEvent(event("payment_intent.succeeded"), h.deps)).toBe("ignored");
    expect(await handleStripeEvent(event("checkout.session.completed", { metadata: { reference: "BLR-NOPE" } }), h.deps)).toBe("not_ours");
    expect(h.paid).toHaveLength(0);
  });
});

describe("Stripe says the deposit wasn't paid", () => {
  it("expired link: the team is told and the customer's chat gets a note; an old replaced page is ignored", async () => {
    const h = harness(quoteRow());
    expect(await handleStripeEvent(event("checkout.session.expired", { payment_status: "unpaid", id: "cs_old" }), h.deps)).toBe("stale");
    expect(await handleStripeEvent(event("checkout.session.expired", { payment_status: "unpaid" }), h.deps)).toBe("expired");
    expect(h.sent[0]!.subject).toContain("Deposit not paid");
    expect(h.notes[0]).toContain("has expired");
  });

  it("failed bank payment: the team is told", async () => {
    const h = harness(quoteRow({ depositStatus: "processing" }));
    expect(await handleStripeEvent(event("checkout.session.async_payment_failed"), h.deps)).toBe("failed");
    expect(h.sent[0]!.text).toContain("didn't go through");
  });
});

describe("a slow webhook must not strand or double a paid booking", () => {
  it("confirms and calendars the booking BEFORE the emails, and lets the emails finish after the reply", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness(bookableRow(), true, gate);
    const deferred: Promise<unknown>[] = [];

    // The handler answers while every email is still stuck behind the gate (the slow PDF).
    expect(await handleStripeEvent(event("checkout.session.completed"), { ...h.deps, defer: (w) => void deferred.push(w) })).toBe("confirmed");
    expect(h.paid).toHaveLength(1); // payment recorded
    expect(h.state.booked).toBe(true); // booking confirmed ...
    expect(h.calendar).toHaveLength(1); // ... and on the calendar
    expect(h.sent).toHaveLength(0); // no email has gone yet
    expect(h.notes).toHaveLength(0);
    expect(deferred).toHaveLength(1);

    release();
    await Promise.all(deferred);
    expect(h.sent.some((e) => e.kind === "team" && e.subject.includes("Booked + deposit paid"))).toBe(true);
    expect(h.notes[0]).toContain("Your move is booked for");
    expect(h.notes[0]).toContain("we've emailed your confirmation");
  });

  it("without a defer hook (tests, local dev) it simply finishes everything before returning", async () => {
    const h = harness(bookableRow());
    expect(await handleStripeEvent(event("checkout.session.completed"), h.deps)).toBe("confirmed");
    expect(h.sent.length).toBeGreaterThan(0);
    expect(h.notes).toHaveLength(1);
  });

  it("a repeat message after a normal run does nothing (no second booking, email or note)", async () => {
    const h = harness(bookableRow());
    await handleStripeEvent(event("checkout.session.completed"), h.deps);
    const emails = h.sent.length;
    // The stored booking now reads confirmed, like the database would.
    const confirmed = harness(bookableRow({ bookingStatus: "confirmed", depositStatus: "paid" }));
    expect(await handleStripeEvent(event("checkout.session.completed"), confirmed.deps)).toBe("duplicate");
    expect(confirmed.sent).toHaveLength(0);
    expect(confirmed.notes).toHaveLength(0);
    expect(confirmed.calendar).toHaveLength(0);
    expect(emails).toBeGreaterThan(0);
  });

  it("RECOVERY: the first delivery died after recording the payment but before confirming -- the retry confirms it", async () => {
    // Payment already recorded as paid, booking still only 'requested'.
    const h = harness(bookableRow({ depositStatus: "paid" }));
    expect(await handleStripeEvent(event("checkout.session.completed"), h.deps)).toBe("confirmed");
    expect(h.paid).toHaveLength(0); // not recorded a second time
    expect(h.state.booked).toBe(true);
    expect(h.calendar).toHaveLength(1);
    expect(h.sent.some((e) => e.kind === "team")).toBe(true);
    expect(h.notes).toHaveLength(1);
  });

  it("two deliveries at once confirm the booking only once", async () => {
    const h = harness(bookableRow({ depositStatus: "paid" }));
    const [a, b] = await Promise.all([handleStripeEvent(event("checkout.session.completed"), h.deps), handleStripeEvent(event("checkout.session.completed"), h.deps)]);
    expect([a, b].filter((o) => o === "confirmed")).toHaveLength(1);
    expect([a, b].filter((o) => o === "duplicate")).toHaveLength(1);
    expect(h.calendar).toHaveLength(1);
  });

  it("a retry when the time can no longer be booked still tells the team", async () => {
    const h = harness(bookableRow({ depositStatus: "paid" }), false);
    expect(await handleStripeEvent(event("checkout.session.completed"), h.deps)).toBe("needs_team");
    expect(h.sent[0]!.subject).toContain("ACTION NEEDED");
    expect(h.calendar).toHaveLength(0);
  });
});
