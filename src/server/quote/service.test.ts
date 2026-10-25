import { describe, expect, it, vi } from "vitest";
import { blrRateCard, type RateCard } from "./rateCard.js";
import { fixtureRateCard } from "./rateCard.fixture.js";
import { handleQuoteRequest, longCarryAtEnd, normalisePhone, type OutgoingEmail, type QuoteApiResult, type QuoteServiceDeps } from "./service.js";
import type { NewQuoteRow, QuoteStore } from "./store.js";

// Same hand-checkable card as the engine tests: ex-GST rates, weekend +20%, round to $10.
const card: RateCard = fixtureRateCard;

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
  propertySize: "2 Bedroom", // guide (fixture): 6-8T + 2 movers, 4 typical hours
  firstMove: false,
};

// Google fake: every leg is 20 km / 30 min, so a 2 bed on a weekday estimates at the hand-checked $720.
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
    // Most tests price a returning customer (standard price); the first-customer tests override this.
    isReturningCustomer: async () => true,
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

    expect(res).toMatchObject({ kind: "price", amountAud: 720, firstMoveApplied: false, emailed: true, testMode: false });
    if (res.kind !== "price") return;
    expect(res.validUntil).toBe("2026-10-20"); // 14 days from "today"

    expect(store!.rows).toHaveLength(1);
    expect(store!.rows[0]).toMatchObject({
      reference: "BLR-TEST-000001",
      status: "priced",
      amountAud: 720,
      rateCardVersion: "test-v1",
      emailNormalised: "jane@example.com",
      phoneNormalised: "0412345678",
    });
    expect(store!.rows[0]!.rateCardSnapshot).toEqual(card);
    expect(store!.emailed).toEqual(["BLR-TEST-000001"]);

    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.to).toBe("jane@example.com");
    expect(customer.replyTo).toBe("hello@example.com");
    expect(customer.subject).toContain("$720");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Internal breakdown");
  });

  it("never shows a customer an hourly rate, a call-out or a breakdown", async () => {
    const { run, sent } = setup();
    const res = result(await run(goodBody));
    const customer = sent.find((e) => e.kind === "customer")!;
    const shown = `${JSON.stringify(res)} ${customer.subject} ${customer.text} ${customer.html}`;
    expect(shown).not.toMatch(/\/hr|per hour|hourly|call-?out|subtotal|surcharge/i);
    expect(customer.text).toContain("This is an estimate based on the details you've provided.");
  });

  it("accepts a chosen truck and crew as the form sends them (strings)", async () => {
    const { run, store } = setup();
    // 2 bed + 4 movers = $1510; 10T = $920 (hand-checked in the engine tests)
    expect(result(await run({ ...goodBody, movers: "4" }))).toMatchObject({ kind: "price", amountAud: 1510 });
    expect(result(await run({ ...goodBody, email: "b@x.com", truck: "10T" }))).toMatchObject({ kind: "price", amountAud: 920 });
    expect(store!.rows[0]).toMatchObject({ propertySize: "2_bed", movers: 4, truck: null });
  });

  it("'let the team inspect' is estimated on the guide and stored as an inspection request", async () => {
    const { run, store } = setup();
    expect(result(await run({ ...goodBody, truck: "inspect", movers: "" }))).toMatchObject({ kind: "price", amountAud: 720 });
    expect(store!.rows[0]).toMatchObject({ truck: "inspect" });
  });

  it("maps the form's home-size labels and the chat's ids", async () => {
    const { run } = setup();
    expect(result(await run({ ...goodBody, propertySize: "Studio / 1 Bed" }))).toMatchObject({ kind: "price" });
    expect(result(await run({ ...goodBody, email: "c@x.com", propertySize: "3_bed" }))).toMatchObject({ kind: "price", amountAud: 1360 });
  });

  it("rejects truck or crew values the form doesn't offer", async () => {
    const { run } = setup();
    expect((await run({ ...goodBody, truck: "3.5T" })).status).toBe(400);
    expect((await run({ ...goodBody, movers: 5 })).status).toBe(400);
  });

  it("stores the access notes and passes them to the team and the customer, without pricing them", async () => {
    const { run, sent, store } = setup();
    const res = result(await run({ ...goodBody, accessNotes: "3rd floor walk-up, truck parks 40m away" }));
    expect(res).toMatchObject({ kind: "price", amountAud: 720 });
    expect(store!.rows[0]).toMatchObject({ accessNotes: "3rd floor walk-up, truck parks 40m away", propertySize: "2_bed", truck: null, movers: null });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Access notes: 3rd floor walk-up");
    expect(sent.find((e) => e.kind === "customer")!.text).toContain("Access: 3rd floor walk-up");
  });

  it("the customer email names the home size and the truck and crew estimated (from the guide)", async () => {
    const { run, sent } = setup();
    await run(goodBody);
    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.text).toContain("Home size: 2 Bedroom");
    expect(customer.text).toContain("Truck & crew: 6-8 tonne truck, 2 movers");
  });
});

describe("the first-customer offer -- worked out from the database, never asked", () => {
  // A customer is "returning" once a job with their email or phone has been booked or completed.
  const withBookedJobs = (booked: { email?: string; phone?: string }[]) =>
    fakeStore({
      isReturningCustomer: async (email, phone) => booked.some((b) => b.email === email || b.phone === phone),
    });

  it("a new email and phone get 10% off automatically, without ticking or saying anything", async () => {
    const { run, store } = setup({ store: withBookedJobs([]) });
    expect(result(await run(goodBody))).toMatchObject({ kind: "price", amountAud: 650, firstMoveApplied: true, firstMoveDenied: false });
    expect(store!.rows[0]).toMatchObject({ firstMoveRequested: true, firstMoveApplied: true });
  });

  it("asking for a second estimate before booking keeps the discount (estimates don't count)", async () => {
    const { run } = setup({ store: withBookedJobs([]) });
    await run(goodBody);
    expect(result(await run({ ...goodBody, name: "Jane S" }))).toMatchObject({ amountAud: 650, firstMoveApplied: true });
  });

  it("anyone who has booked with us before -- same email OR same phone -- gets the standard price", async () => {
    expect(result(await setup({ store: withBookedJobs([{ email: "jane@example.com" }]) }).run(goodBody))).toMatchObject({ amountAud: 720, firstMoveApplied: false, firstMoveDenied: false });
    expect(result(await setup({ store: withBookedJobs([{ phone: "0412345678" }]) }).run({ ...goodBody, email: "other@example.com" }))).toMatchObject({ amountAud: 720, firstMoveApplied: false });
  });

  it("the old 'first move' tick-box is ignored either way", async () => {
    expect(result(await setup().run({ ...goodBody, firstMove: true }))).toMatchObject({ amountAud: 720, firstMoveApplied: false });
    expect(result(await setup({ store: withBookedJobs([]) }).run({ ...goodBody, firstMove: false }))).toMatchObject({ amountAud: 650 });
  });
});

describe("priced access", () => {
  it("stairs (no lift) and a long carry are added to the estimate", async () => {
    const { run, store } = setup();
    // fixture: $40 per flight, $60 long carry; 2 flights + long carry at ONE end on the $720 job = (652.5 + 80 + 60) * 1.1 = 871.75 -> $870
    const res = result(await run({ ...goodBody, pickupStairFlights: 1, dropoffStairFlights: 1, dropoffParkingOver50m: true }));
    expect(res).toMatchObject({ kind: "price", amountAud: 870 });
    expect(store!.rows[0]!.inputs).toMatchObject({ access: { pickupStairFlights: 1, dropoffStairFlights: 1, pickupLongCarry: false, dropoffLongCarry: true } });
  });

  it("Blue Line's long-carry rule: always at an apartment end, or when parking is over 50 m -- once per end", async () => {
    expect(longCarryAtEnd(true, false)).toBe(true); // apartment, parking not mentioned
    expect(longCarryAtEnd(false, true)).toBe(true); // house, truck parks over 50 m away
    expect(longCarryAtEnd(true, true)).toBe(true); // still only ONE charge for that end
    expect(longCarryAtEnd(false, false)).toBe(false); // house, parking close or not known
    const { run, store } = setup();
    // apartment to apartment: 2 ends x $60 = 120 -> (652.5 + 120) * 1.1 = 849.75 -> $850
    const res = result(await run({ ...goodBody, pickupApartment: true, dropoffApartment: true, dropoffParkingOver50m: true }));
    expect(res).toMatchObject({ kind: "price", amountAud: 850 });
    expect(store!.rows[0]!.inputs).toMatchObject({ access: { pickupLongCarry: true, dropoffLongCarry: true } });
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
  it("no home size given", () => expectManual({}, { ...goodBody, propertySize: "" }, "size_missing"));
  it("office move", () => expectManual({}, { ...goodBody, propertySize: "Office / Commercial" }, "commercial_or_unsure_size"));
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

describe("personal quote straight from the chat (the team prices it)", () => {
  it("skips pricing and Google, records the job in the customer's words, and tells the team and the customer", async () => {
    const fetchImpl = routeFetch();
    const { sent, store } = setup({ routes: { apiKey: "k", fetchImpl } });
    const res = await handleQuoteRequest(
      { name: "Sam Lee", phone: "0400 111 222", email: "sam@example.com", need: "moving", from: "Chirnside Park", to: "Milawa", date: "2026-10-15" },
      { rateCard: card, allowPlaceholderRateCard: false, routes: { apiKey: "k", fetchImpl }, store: store!, sendEmail: async (e) => (sent.push(e), true), teamEmail: "team@example.com", customerReplyTo: "hello@example.com", now: () => NOW, makeReference: () => "BLR-TEST-000002", log: () => {} },
      { source: "chatbot", conversationId: "conv-9", personalQuote: { reason: "small_load", description: "3-4 boxes, must arrive by 3pm" } },
    );
    expect(res).toMatchObject({ status: 200, body: { ok: true, result: { kind: "manual", reference: "BLR-TEST-000002" } } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store!.rows[0]).toMatchObject({ status: "manual_review", manualReason: "small_load", jobDescription: "3-4 boxes, must arrive by 3pm", amountAud: null });
    const team = sent.find((e) => e.kind === "team")!;
    expect(team.text).toContain("PERSONAL QUOTE REQUESTED");
    expect(team.text).toContain("3-4 boxes, must arrive by 3pm");
    expect(sent.find((e) => e.kind === "customer")!.subject).toContain("got your quote request");
  });
});

describe("placeholder rate card in dev/preview", () => {
  const placeholder: RateCard = { ...card, status: "placeholder" };

  it("Blue Line's real card, still on test status: a TEST price on screen only, never emailed to the customer; in production it goes to a person", async () => {
    const test = setup({ rateCard: blrRateCard, allowPlaceholderRateCard: true });
    expect(result(await test.run(goodBody))).toMatchObject({ kind: "price", testMode: true, emailed: false });
    expect(test.sent.filter((e) => e.kind === "customer")).toHaveLength(0);

    const live = setup({ rateCard: blrRateCard });
    expect(result(await live.run(goodBody)).kind).toBe("manual");
    expect(live.sent.find((e) => e.kind === "team")!.text).toContain("rate_card_not_confirmed");
  });

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

describe("full street addresses (so the driver can find the pick-up)", () => {
  const addr = (o: Record<string, string> = {}) => ({ unitNumber: "4/12", street: "Station St", suburb: "Preston", state: "VIC", postcode: "3072", ...o });
  const { from: _from, to: _to, ...withoutText } = goodBody;

  it("the form's separate boxes become one line used for the quote, the team email and the calendar", async () => {
    const { run, sent, store } = setup();
    const res = await run({ ...withoutText, fromAddress: addr(), toAddress: addr({ unitNumber: "5", street: "High St", suburb: "Brunswick", postcode: "3056" }) });
    expect(res.status).toBe(200);
    expect(store!.rows[0]).toMatchObject({ fromText: "4/12 Station St, Preston VIC 3072", toText: "5 High St, Brunswick VIC 3056" });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("4/12 Station St, Preston VIC 3072");
  });

  it("a half-filled address is sent back with what is missing", async () => {
    const { run, sent } = setup();
    expect(await run({ ...withoutText, fromAddress: addr({ unitNumber: "" }), toAddress: addr() })).toMatchObject({
      status: 400,
      body: { ok: false, error: "Add the unit or house number for the pick-up address." },
    });
    expect(await run({ ...withoutText, fromAddress: addr(), toAddress: addr({ postcode: "30" }) })).toMatchObject({ status: 400, body: { error: expect.stringContaining("4-digit postcode") } });
    expect(sent).toHaveLength(0);
  });

  it("a blank address box just means none was given, and the chat's one-line address still works", async () => {
    const { run, store } = setup();
    await run({ ...goodBody, from: "12 Station St, Preston VIC 3072", fromAddress: addr({ unitNumber: "", street: "", suburb: "", postcode: "" }) });
    expect(store!.rows[0]).toMatchObject({ fromText: "12 Station St, Preston VIC 3072" });
  });
});

describe("Junk Removal on the quote form: details and photos reach the team", () => {
  const { from: _f, to: _t, ...withoutText } = goodBody;
  const jpeg = (n = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1)]).toString("base64");
  const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 2)]).toString("base64");
  const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), Buffer.from("heic"), Buffer.alloc(300, 3)]).toString("base64");
  const addr = { unitNumber: "4/12", street: "Station St", suburb: "Preston", state: "VIC", postcode: "3072" };
  const junk = (over: Record<string, unknown> = {}) => ({
    ...withoutText,
    need: "junk",
    propertySize: "",
    fromAddress: addr,
    junkDetails: "old sofa, fridge, 10 garden bags, mattress",
    photos: [
      { name: "IMG_1.jpg", type: "image/jpeg", data: jpeg() },
      { name: "IMG_2.png", type: "image/png", data: png() },
      { name: "IMG_3.heic", type: "image/heic", data: heic() },
    ],
    ...over,
  });

  it("emails the team the junk details and the photos as attachments, with which service was picked", async () => {
    const { run, sent, store } = setup();
    const res = await run(junk());
    expect(res.status).toBe(200);
    const team = sent.find((e) => e.kind === "team")!;
    expect(team.subject).toContain("(Junk Removal)");
    expect(team.text).toContain("Needs help with: Junk Removal");
    expect(team.text).toContain("Junk details: old sofa, fridge, 10 garden bags, mattress");
    expect(team.text).toContain("Junk photos: 3 attached to this email");
    expect(team.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ["junk-photo-1-IMG_1.jpg", "image/jpeg"],
      ["junk-photo-2-IMG_2.png", "image/png"],
      ["junk-photo-3-IMG_3.heic", "image/heic"],
    ]);
    // the customer's own email carries no attachments, and the details are stored for the dashboard
    expect(sent.find((e) => e.kind === "customer")!.attachments).toBeUndefined();
    expect(store!.rows[0]).toMatchObject({ need: "junk", status: "manual_review", manualReason: "junk_removal", jobDescription: "old sofa, fridge, 10 garden bags, mattress", fromText: "4/12 Station St, Preston VIC 3072" });
  });

  it("works with no photos and no details too", async () => {
    const { run, sent } = setup();
    expect((await run(junk({ photos: [], junkDetails: "" }))).status).toBe(200);
    const team = sent.find((e) => e.kind === "team")!;
    expect(team.text).toContain("Junk details: -");
    expect(team.text).toContain("Junk photos: none sent");
    expect(team.attachments).toBeUndefined();
  });

  it("Junk Removal ignores a home size and notes; Moving ignores junk details and photos", async () => {
    const a = setup();
    await a.run(junk({ propertySize: "3 Bedroom", notes: "should not be kept" }));
    expect(a.store!.rows[0]).toMatchObject({ propertySize: null, customerNotes: null });

    const b = setup();
    await b.run({ ...goodBody, junkDetails: "old sofa", photos: [{ name: "a.jpg", type: "image/jpeg", data: jpeg() }] });
    expect(b.store!.rows[0]).toMatchObject({ need: "moving", jobDescription: null });
    const team = b.sent.find((e) => e.kind === "team")!;
    expect(team.attachments).toBeUndefined();
    expect(team.text).not.toContain("Junk details");
  });

  it("refuses photos that aren't what they claim, too many, or too big -- and sends nothing", async () => {
    const { run, sent } = setup();
    const bad = (photos: unknown[]) => run(junk({ photos }));
    const notAPhoto = Buffer.from("%PDF-1.7 definitely not a photo").toString("base64");
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: notAPhoto }])).toMatchObject({ status: 400, body: { error: expect.stringContaining("couldn't be read") } });
    expect(await bad([{ name: "a.jpg", type: "image/png", data: jpeg() }])).toMatchObject({ status: 400 }); // a JPEG labelled PNG
    expect(await bad([{ name: "a.gif", type: "image/gif", data: jpeg() }])).toMatchObject({ status: 400 });
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: "not base64!!" }])).toMatchObject({ status: 400 });
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: jpeg(950_000) }])).toMatchObject({ status: 400 }); // over 900 KB
    expect(await bad(Array.from({ length: 7 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", data: jpeg() })))).toMatchObject({ status: 400 });
    // together too big for one request, though each is fine on its own
    expect(await bad(Array.from({ length: 4 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", data: jpeg(800_000) })))).toMatchObject({ status: 400, body: { error: expect.stringContaining("too large to send together") } });
    expect(sent).toHaveLength(0);
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

  it("puts back the leading 0 a spreadsheet drops from a mobile", () => {
    expect(normalisePhone("412789775")).toBe("0412789775");
    expect(normalisePhone("61477325794")).toBe("0477325794");
  });
});
