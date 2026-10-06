import { describe, expect, it, vi } from "vitest";
import { placeholderRateCard, type RateCard } from "./rateCard.js";
import { handleQuoteRequest, normalisePhone, type OutgoingEmail, type QuoteApiResult, type QuoteServiceDeps } from "./service.js";
import type { NewQuoteRow, QuoteStore } from "./store.js";

// Same hand-checkable card as the engine tests: ex-GST rates, weekend +20%, round to $10.
const card: RateCard = {
  ...placeholderRateCard,
  version: "test-v1",
  status: "confirmed",
  gst: { ratesIncludeGst: false, ratePercent: 10 },
  weekendHolidaySurchargePercent: 20,
};

const NOW = new Date("2026-10-06T02:00:00Z"); // 12:00 in Melbourne, 6 Oct 2026
const WEEKDAY = "2026-10-14";

const goodBody = {
  name: "Jane Smith",
  phone: "+61 412 345 678",
  email: "Jane@Example.com",
  need: "moving",
  from: "Preston",
  to: "Brunswick",
  date: WEEKDAY,
  propertySize: "2 Bedroom",
  firstMove: false,
};

// Google fake: every leg is 20 km / 30 min, so a 2 bed weekday prices at the hand-checked $780.
const routeFetch = (ok = true) =>
  vi.fn(async () => ({
    ok,
    json: async () => ({ routes: [{ distanceMeters: 20000, duration: "1800s" }] }),
  })) as unknown as typeof fetch;

function fakeStore(overrides: Partial<QuoteStore> = {}) {
  const rows: NewQuoteRow[] = [];
  const store: QuoteStore & { rows: NewQuoteRow[]; emailed: string[] } = {
    rows,
    emailed: [],
    hasDiscountedQuote: async (email, phone) => rows.some((r) => r.firstMoveApplied && (r.emailNormalised === email || r.phoneNormalised === phone)),
    recentQuoteCount: async (email) => rows.filter((r) => r.emailNormalised === email).length,
    saveQuote: async (row) => void rows.push(row),
    markCustomerEmailSent: async (ref) => void store.emailed.push(ref),
    ...overrides,
  };
  return store;
}

function setup(overrides: Omit<Partial<QuoteServiceDeps>, "store"> & { store?: QuoteStore | null } = {}) {
  const { store: storeOverride, ...rest } = overrides;
  const sent: OutgoingEmail[] = [];
  // null = "no database configured"; undefined = use the default in-memory fake.
  const store = storeOverride === null ? undefined : (storeOverride ?? fakeStore());
  const deps: QuoteServiceDeps = {
    rateCard: card,
    allowPlaceholderRateCard: false,
    routes: { apiKey: "k", fetchImpl: routeFetch() },
    store,
    sendEmail: async (e) => (sent.push(e), true),
    teamEmail: "team@example.com",
    customerReplyTo: "hello@example.com",
    now: () => NOW,
    makeReference: () => "BLR-TEST-000001",
    log: () => {},
    ...rest,
  };
  const run = (body: unknown) => handleQuoteRequest(body, deps);
  return { run, sent, store: store as ReturnType<typeof fakeStore> | undefined };
}

const result = (r: Awaited<ReturnType<typeof handleQuoteRequest>>): QuoteApiResult => {
  if (r.status !== 200 || !r.body.ok) throw new Error(`expected 200 ok, got ${r.status}`);
  return r.body.result;
};

describe("a normal quote", () => {
  it("prices the job, stores it with its inputs and rate card, and emails the customer and the team", async () => {
    const { run, sent, store } = setup();
    const res = result(await run(goodBody));

    expect(res).toMatchObject({ kind: "price", amountAud: 780, firstMoveApplied: false, emailed: true, testMode: false });
    if (res.kind !== "price") return;
    expect(res.validUntil).toBe("2026-10-20"); // 14 days from "today"

    expect(store!.rows).toHaveLength(1);
    expect(store!.rows[0]).toMatchObject({
      reference: "BLR-TEST-000001",
      status: "priced",
      amountAud: 780,
      rateCardVersion: "test-v1",
      emailNormalised: "jane@example.com",
      phoneNormalised: "0412345678",
    });
    expect(store!.rows[0]!.rateCardSnapshot).toEqual(card);
    expect(store!.emailed).toEqual(["BLR-TEST-000001"]);

    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.to).toBe("jane@example.com");
    expect(customer.replyTo).toBe("hello@example.com");
    expect(customer.subject).toContain("$780");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Internal breakdown");
  });

  it("never shows a customer an hourly rate, a call-out or a breakdown", async () => {
    const { run, sent } = setup();
    const res = result(await run(goodBody));
    const customer = sent.find((e) => e.kind === "customer")!;
    const shown = `${JSON.stringify(res)} ${customer.subject} ${customer.text} ${customer.html}`;
    expect(shown).not.toMatch(/\/hr|per hour|hourly|call-?out|subtotal|surcharge/i);
    expect(customer.text).toContain("final price");
  });

  it("maps every dropdown label the form sends (including the old bug where it sent nothing)", async () => {
    const { run } = setup();
    expect(result(await run({ ...goodBody, propertySize: "Studio / 1 Bed" }))).toMatchObject({ kind: "price" });
    expect(result(await run({ ...goodBody, email: "b@x.com", propertySize: null }))).toMatchObject({ kind: "manual" });
  });
});

describe("the first-move offer", () => {
  it("takes 30% off once, then the same email or phone gets the standard price", async () => {
    const { run } = setup();
    const first = result(await run({ ...goodBody, firstMove: true }));
    expect(first).toMatchObject({ kind: "price", amountAud: 550, firstMoveApplied: true, firstMoveDenied: false });

    const again = result(await run({ ...goodBody, name: "Jane S", firstMove: true }));
    expect(again).toMatchObject({ kind: "price", amountAud: 780, firstMoveApplied: false, firstMoveDenied: true });

    // same phone, different email, still no second discount
    const samePhone = result(await run({ ...goodBody, email: "other@example.com", firstMove: true }));
    expect(samePhone).toMatchObject({ amountAud: 780, firstMoveDenied: true });
  });

  it("isn't applied unless the customer asked for it", async () => {
    const { run } = setup();
    expect(result(await run(goodBody))).toMatchObject({ amountAud: 780, firstMoveDenied: false });
  });
});

describe("when it can't give a price, a person follows up -- and the lead is never lost", () => {
  const expectManual = async (setupOverrides: Parameters<typeof setup>[0], body: unknown, reason: string) => {
    const { run, sent, store } = setup(setupOverrides);
    const res = result(await run(body));
    expect(res.kind).toBe("manual");
    expect(JSON.stringify(res)).not.toMatch(/\$\d|amountAud/);
    expect(sent.find((e) => e.kind === "team")!.text).toContain(reason);
    expect(sent.find((e) => e.kind === "customer")!.subject).toContain("got your quote request");
    if (store) expect(store.rows[0]).toMatchObject({ status: "manual_review", manualReason: reason, amountAud: null });
  };

  it("no database configured", () => expectManual({ store: null }, goodBody, "service_unavailable"));
  it("no Google key configured", () => expectManual({ routes: null }, goodBody, "service_unavailable"));
  it("Google can't route it", () => expectManual({ routes: { apiKey: "k", fetchImpl: routeFetch(false) } }, goodBody, "distance_unavailable"));
  it("junk removal", () => expectManual({}, { ...goodBody, need: "junk" }, "junk_removal"));
  it("a date in the past", () => expectManual({}, { ...goodBody, date: "2026-10-01" }, "date_missing"));
  it("an impossible date", () => expectManual({}, { ...goodBody, date: "2026-02-31" }, "date_missing"));
  it("no pickup/drop-off given", () => expectManual({}, { ...goodBody, from: "", to: "" }, "distance_unavailable"));

  it("if the quote can't be stored, it falls back to a person instead of showing an unrecorded price", async () => {
    const calls: string[] = [];
    const store = fakeStore({
      saveQuote: async (row) => {
        calls.push(row.status);
        if (row.status === "priced") throw new Error("db down");
      },
    });
    const { run, sent } = setup({ store });
    const res = result(await run(goodBody));
    expect(res.kind).toBe("manual");
    expect(calls).toEqual(["priced", "manual_review"]);
    expect(sent.find((e) => e.kind === "customer")!.text).not.toContain("$");
  });

  it("returns an error only if the lead was neither stored nor emailed to the team", async () => {
    const down = async () => false;
    const none = setup({ store: null, sendEmail: down });
    const bad = await none.run(goodBody);
    expect(bad.status).toBe(502);

    const storedAnyway = setup({ sendEmail: down });
    expect((await storedAnyway.run(goodBody)).status).toBe(200);
  });
});

describe("placeholder rate card in dev/preview", () => {
  const placeholder = { ...placeholderRateCard, gst: { ratesIncludeGst: false, ratePercent: 10 } };

  it("refuses to price unless explicitly allowed", async () => {
    const { run, sent } = setup({ rateCard: placeholder });
    expect(result(await run(goodBody)).kind).toBe("manual");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("rate_card_not_confirmed");
  });

  it("when allowed, shows a price on screen flagged as test mode and NEVER emails it to the customer", async () => {
    const { run, sent } = setup({ rateCard: placeholder, allowPlaceholderRateCard: true });
    const res = result(await run(goodBody));
    expect(res).toMatchObject({ kind: "price", testMode: true, emailed: false });
    expect(sent.filter((e) => e.kind === "customer")).toHaveLength(0);
    expect(sent.find((e) => e.kind === "team")!.text).toContain("TEST MODE");
  });
});

describe("validation and abuse limits", () => {
  it("keeps the form's existing messages", async () => {
    const { run } = setup();
    const missing = await run({ ...goodBody, email: "" });
    expect(missing).toMatchObject({ status: 400, body: { error: "Name, phone, and email are required." } });
    const bad = await run({ ...goodBody, email: "not-an-email" });
    expect(bad).toMatchObject({ status: 400, body: { error: "Enter a valid email address." } });
  });

  it("rejects non-object bodies", async () => {
    const { run } = setup();
    expect((await run("nonsense")).status).toBe(400);
    expect((await run(undefined)).status).toBe(400);
  });

  it("throttles an email after 3 quotes in the hour, without sending anything", async () => {
    const { run, sent } = setup();
    for (let i = 0; i < 3; i++) await run(goodBody);
    sent.length = 0;
    const res = await run(goodBody);
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(0);
  });
});

describe("normalisePhone", () => {
  it("treats +61 and 0 forms as the same number", () => {
    expect(normalisePhone("+61 412 345 678")).toBe("0412345678");
    expect(normalisePhone("0412 345 678")).toBe("0412345678");
    expect(normalisePhone("(03) 9494 1070")).toBe("0394941070");
  });
});
