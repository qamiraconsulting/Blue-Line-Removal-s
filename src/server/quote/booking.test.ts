import { describe, expect, it } from "vitest";
import type { CapacitySettings, CapacitySnapshot } from "../capacity/availability.js";
import type { NewCalendarBooking } from "../capacity/store.js";
import { availabilityForQuote, confirmPaidBooking, requestBooking, type BookingStore, type StoredQuote } from "./booking.js";
import type { DepositPaymentDeps } from "../payments/depositPayment.js";
import type { DepositCheckoutRequest } from "../payments/stripe.js";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION } from "./bookingEmails.js";
import { fixtureRateCard } from "./rateCard.fixture.js";
import type { DriverNotifier, OutgoingEmail } from "./service.js";

const NOW = new Date("2026-10-12T02:00:00Z"); // Mon 12 Oct, 13:00 in Melbourne

const quote = (over: Partial<StoredQuote> = {}): StoredQuote => ({
  reference: "BLR-20261012-ABC123",
  conversationId: "conv-1",
  source: "chatbot",
  bookingToken: null,
  status: "priced",
  amountAud: 720,
  validUntil: "2026-10-22",
  customerName: "Jane Smith",
  phone: "0412 345 678",
  email: "jane@example.com",
  propertySize: "2_bed",
  truck: null,
  movers: null,
  accessNotes: "2nd floor walk-up",
  movingDate: "2026-10-21", // a Wednesday
  fromText: "Preston",
  toText: "Brunswick",
  internalBreakdown: { truck: "6-8T", movers: 2, jobHours: 4.5, crewRateAudPerHour: 140, labourCostAud: 630, accessCostAud: 0 },
  rateCardSnapshot: fixtureRateCard,
  rateCardStatus: "confirmed",
  bookingStatus: null,
  bookingNotes: null,
  bookingArrivalTime: null,
  depositStatus: null,
  depositCheckoutUrl: null,
  depositCheckoutExpiresAt: null,
  depositPaymentMethod: null,
  ...over,
});

const NOT_SET_UP: CapacitySettings = {
  autoConfirm: false,
  workingDays: [],
  arrivalTimes: [],
  dayEndTime: null,
  bufferMinutes: null,
  moversPerDay: null,
  minNoticeHours: null,
  maxDaysAhead: null,
  autoConfirmMaxAud: null,
};
const READY: CapacitySettings = {
  autoConfirm: true,
  workingDays: [1, 2, 3, 4, 5, 6],
  arrivalTimes: ["07:30", "12:00"],
  dayEndTime: "18:00",
  bufferMinutes: 30,
  moversPerDay: 4,
  minNoticeHours: 24,
  maxDaysAhead: 60,
  autoConfirmMaxAud: null,
};

function setup(stored: StoredQuote | null, settings: CapacitySettings = NOT_SET_UP, extraTrucks: CapacitySnapshot["trucks"] = []) {
  const sent: OutgoingEmail[] = [];
  const calendar: NewCalendarBooking[] = [];
  let row = stored;
  const capacity = (): Omit<CapacitySnapshot, "nowLocal"> => ({
    settings,
    trucks: [{ id: "truck-a", truckType: "6-8T", active: true }, ...extraTrucks],
    override: null,
    bookings: calendar.map((b) => ({ arrivalTime: b.arrivalTime, estimatedMinutes: b.estimatedMinutes, truckType: b.truckType, truckId: b.truckId ?? null, movers: b.movers })),
  });
  const bookings: BookingStore = {
    findQuote: async (ref) => (row && row.reference === ref ? row : null),
    markRequested: async (_ref, b) => {
      if (!row || row.bookingStatus) return false;
      row = { ...row, bookingStatus: "requested", bookingNotes: b.notes, bookingArrivalTime: b.arrivalTime };
      return true;
    },
    loadCapacity: async () => capacity(),
    confirm: async (_ref, _date, decide, fields) => {
      if (!row || row.bookingStatus === "confirmed") return null;
      const decision = decide(capacity());
      if (!decision) return null;
      calendar.push(decision.booking);
      row = { ...row, bookingStatus: "confirmed", bookingArrivalTime: fields.arrivalTime ?? row.bookingArrivalTime };
      return decision.result;
    },
  };
  const deps = { bookings, sendEmail: async (e: OutgoingEmail) => (sent.push(e), true), teamEmail: "team@example.com", customerReplyTo: "hello@example.com", now: () => NOW };
  return { deps, sent, calendar, row: () => row };
}

const ask = (deps: ReturnType<typeof setup>["deps"] & { testEmailTo?: string; notifyDriver?: DriverNotifier }, over: Partial<Parameters<typeof requestBooking>[0]> = {}) =>
  requestBooking({ reference: "BLR-20261012-ABC123", conversationId: "conv-1", notes: "Morning if possible", ...over }, deps);

describe("booking request (team confirms) -- the default until capacity is set up", () => {
  it("records the request with the exact terms agreed, emails the team and the customer", async () => {
    const { deps, sent, row } = setup(quote());
    expect(await ask(deps)).toMatchObject({ ok: true, status: "requested", reference: "BLR-20261012-ABC123", emailed: true });
    expect(row()).toMatchObject({ bookingStatus: "requested", bookingNotes: "Morning if possible" });

    const team = sent.find((e) => e.kind === "team")!;
    expect(team.subject).toContain("Booking request");
    expect(team.text).toContain(BOOKING_TERMS);
    expect(team.text).toContain(`version ${BOOKING_TERMS_VERSION}`);

    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.subject).toContain("received your booking request");
    expect(customer.text).toContain(BOOKING_TERMS);
    expect(customer.text).toContain("Truck & crew: 6-8 tonne truck, 2 movers");
    expect(customer.text).not.toMatch(/is booked/i);
  });

  it("is idempotent and accepts the reference in any case", async () => {
    const { deps, sent } = setup(quote());
    await ask(deps, { reference: "blr-20261012-abc123" });
    sent.length = 0;
    expect(await ask(deps)).toMatchObject({ ok: true, status: "already_requested" });
    expect(sent).toHaveLength(0);
  });

  it("only books an estimate from the same chat, that is priced and current", async () => {
    expect(await ask(setup(quote()).deps, { conversationId: "someone-else" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await ask(setup(quote({ status: "manual_review", amountAud: null })).deps)).toMatchObject({ ok: false, reason: "no_estimate" });
    expect(await ask(setup(quote({ validUntil: "2026-10-11" })).deps)).toMatchObject({ ok: false, reason: "expired" });
    expect(await ask(setup(quote({ movingDate: "2026-10-01" })).deps)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("test-mode estimates are never emailed to the customer", async () => {
    const { deps, sent } = setup(quote({ rateCardStatus: "placeholder" }));
    expect(await ask(deps)).toMatchObject({ ok: true, status: "requested", emailed: false });
    expect(sent.map((e) => e.kind)).toEqual(["team"]);
    expect(sent[0]!.text).toContain("TEST MODE");
  });

  it("with no arrival times set up, the chat is told to take the preferred time in notes", async () => {
    const out = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, setup(quote()).deps);
    expect(out).toMatchObject({ ok: true, onlineBookingOpen: false, availableTimes: [], instantTimes: [] });
  });
});

describe("instant confirmation (switched on by the team, everything set up)", () => {
  // A move under a week away takes no deposit, so the chat can confirm it on the spot.
  const soonQuote = (over: Partial<StoredQuote> = {}) => quote({ movingDate: "2026-10-16", ...over });

  it("offers the free arrival times and says they'd be confirmed on the spot", async () => {
    const out = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, setup(soonQuote(), READY).deps);
    expect(out).toMatchObject({ ok: true, date: "2026-10-16", onlineBookingOpen: true, availableTimes: ["07:30", "12:00"], instantTimes: ["07:30", "12:00"] });
  });

  it("books it, adds it to the calendar with the truck, and emails 'your move is booked'", async () => {
    const { deps, sent, calendar, row } = setup(soonQuote(), READY);
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "confirmed", arrivalTime: "07:30", emailed: true });
    expect(calendar[0]).toMatchObject({ quoteReference: "BLR-20261012-ABC123", date: "2026-10-16", arrivalTime: "07:30", truckId: "truck-a", movers: 2, estimatedMinutes: 270, source: "chat" });
    expect(row()!.bookingStatus).toBe("confirmed");
    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.subject).toContain("Your move is booked");
    expect(customer.text).toContain("arrival 7:30am");
    expect(customer.text).toContain("Total (GST included): $720");
    expect(customer.text).toContain(BOOKING_TERMS); // final charges still confirmed on the day
    expect(sent.find((e) => e.kind === "team")!.subject).toMatch(/^Booked:/);
  });

  it("a taken time is refused with the times still free", async () => {
    const { deps, calendar } = setup(soonQuote(), READY);
    calendar.push({ source: "phone", date: "2026-10-16", arrivalTime: "07:30", estimatedMinutes: 240, truckType: "6-8T", truckId: "truck-a", movers: 2 });
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: false, reason: "time_unavailable", availableTimes: ["12:00"] });
  });

  it("if another customer takes the time at the same moment, it backs out instead of double-booking", async () => {
    const { deps, calendar } = setup(soonQuote(), READY);
    const original = deps.bookings.confirm;
    deps.bookings.confirm = async (ref, date, decide, fields) => {
      calendar.push({ source: "chat", date, arrivalTime: "07:30", estimatedMinutes: 600, truckType: "6-8T", truckId: "truck-a", movers: 2 }); // the other customer
      return original(ref, date, decide, fields);
    };
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: false, reason: "time_unavailable" });
    expect(calendar).toHaveLength(1);
  });

  it("if only a smaller truck is free, the time is still offered -- as a request, with a truck note for the team", async () => {
    const { deps, sent, calendar } = setup(soonQuote(), READY, [{ id: "truck-small", truckType: "4.5T", active: true }]);
    // the 6-8T is busy all day; the 4.5T is free
    calendar.push({ source: "phone", date: "2026-10-16", arrivalTime: "07:00", estimatedMinutes: 600, truckType: "6-8T", truckId: "truck-a", movers: 2 });

    const times = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, deps);
    expect(times).toMatchObject({ ok: true, availableTimes: ["07:30", "12:00"], instantTimes: [] });

    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested", arrivalTime: "07:30" });
    expect(calendar).toHaveLength(1); // not confirmed instantly
    expect(sent.find((e) => e.kind === "team")!.text).toContain("TRUCK: No 6-8T truck is free at 07:30; a 4.5T is free (more trips if smaller)");
  });

  it("a booking with a deposit (7+ days away) is never confirmed on the spot: the team confirms once it's paid", async () => {
    const { deps, calendar } = setup(quote(), READY); // 9 days away
    const times = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, deps);
    expect(times).toMatchObject({ ok: true, availableTimes: ["07:30", "12:00"], instantTimes: [], deposit: { required: true } });
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested", arrivalTime: "07:30", deposit: { required: true } });
    expect(calendar).toHaveLength(0);
  });

  it("tells the truck's driver once an instant booking is confirmed -- and never for a request", async () => {
    const told: unknown[] = [];
    const notifyDriver = async (target: unknown) => (told.push(target), { status: "unchanged" as const });
    const instant = setup(soonQuote(), READY);
    await ask({ ...instant.deps, notifyDriver }, { arrivalTime: "07:30" });
    expect(told).toEqual([{ quoteReference: "BLR-20261012-ABC123" }]);

    told.length = 0;
    const request = setup(soonQuote(), NOT_SET_UP);
    await ask({ ...request.deps, notifyDriver });
    expect(told).toEqual([]);
  });

  it("a driver notice that fails never undoes the booking", async () => {
    const { deps, row } = setup(soonQuote(), READY);
    const out = await ask({ ...deps, notifyDriver: async () => Promise.reject(new Error("mail down")) }, { arrivalTime: "07:30" });
    expect(out).toMatchObject({ ok: true, status: "confirmed" });
    expect(row()!.bookingStatus).toBe("confirmed");
  });

  it("over the instant-confirm limit, or in test mode, it becomes a request for the team", async () => {
    expect(await ask(setup(soonQuote(), { ...READY, autoConfirmMaxAud: 500 }).deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested", arrivalTime: "07:30" });
    expect(await ask(setup(soonQuote({ rateCardStatus: "placeholder" }), READY).deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested" });
  });
});

describe("the website form books with the token that came back with its estimate", () => {
  const formQuote = () => quote({ conversationId: null, source: "quote_form", bookingToken: "a".repeat(32) });

  it("books with the right token, and the team email says it came from the website form", async () => {
    const { deps, sent, row } = setup(formQuote());
    const out = await requestBooking({ reference: "BLR-20261012-ABC123", bookingToken: "a".repeat(32), notes: "" }, deps);
    expect(out).toMatchObject({ ok: true, status: "requested" });
    expect(row()!.bookingStatus).toBe("requested");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("on the website form");
  });

  it("refuses a wrong or missing token -- nobody can book someone else's estimate by its reference", async () => {
    const { deps } = setup(formQuote());
    expect(await requestBooking({ reference: "BLR-20261012-ABC123", bookingToken: "b".repeat(32) }, deps)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await requestBooking({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, deps)).toMatchObject({ ok: false, reason: "not_found" });
    const chatOnly = setup(quote()).deps; // a chat estimate has no token
    expect(await requestBooking({ reference: "BLR-20261012-ABC123", bookingToken: "" }, chatOnly)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("in a preview, test-mode customer emails go to the test inbox, marked [TEST]", async () => {
    const { deps, sent } = setup(quote({ rateCardStatus: "placeholder" }));
    const out = await ask({ ...deps, testEmailTo: "tester@example.com" });
    expect(out).toMatchObject({ ok: true, emailed: true });
    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.to).toBe("tester@example.com");
    expect(customer.subject.startsWith("[TEST] ")).toBe(true);
  });
});

/** Stripe stand-in: records the pages made; `fail` = Stripe says no. */
function fakeDeposits(fail = false) {
  const made: DepositCheckoutRequest[] = [];
  const deposits: DepositPaymentDeps = {
    stripe: { secretKey: "sk_test_x" },
    siteUrl: "https://site.example",
    store: { saveCheckout: async () => undefined, markProcessing: async () => undefined, markPaid: async () => true, markEnded: async () => true },
    createCheckout: async (req) => {
      if (fail) throw new Error("Stripe checkout failed (402 card_error)");
      made.push(req);
      return { id: `cs_test_${made.length}`, url: `https://checkout.stripe.com/c/pay/cs_test_${made.length}`, expiresAt: req.expiresAt };
    },
  };
  return { deposits, made };
}

describe("the $100 deposit (a week or more ahead)", () => {
  // NOW is Mon 12 Oct; the quote's move is Wed 21 Oct -- 9 days away.
  it("a booking 7+ days ahead gets its own Stripe payment page: in the result, the customer email and the team email", async () => {
    const { deps, sent } = setup(quote());
    const { deposits, made } = fakeDeposits();
    const out = await ask({ ...deps, deposits } as typeof deps);
    expect(out).toMatchObject({ ok: true, status: "requested", deposit: { required: true, amountAud: 100, daysUntilMove: 9, paymentLink: "https://checkout.stripe.com/c/pay/cs_test_1", linkValidHours: 24 } });
    expect(made[0]).toMatchObject({ reference: "BLR-20261012-ABC123", amountCents: 10000, customerEmail: "jane@example.com", successUrl: "https://site.example/deposit?status=paid&ref=BLR-20261012-ABC123" });
    // Stripe allows at most 24 hours.
    expect(made[0]!.expiresAt - NOW.getTime() / 1000).toBeLessThanOrEqual(24 * 3600);
    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.text).toContain("To lock in your booking we take a $100 deposit before the move.");
    expect(customer.text).toContain("Pay it securely here, by card or straight from your bank account: https://checkout.stripe.com/c/pay/cs_test_1");
    expect(customer.text).toContain("The link works for 24 hours.");
    expect(customer.text).toContain("card, bank transfer or cash");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("confirmed automatically if the time is still free");
  });

  it("asking again reuses the open payment page; an expired one is replaced; a paid one needs none", async () => {
    const open = { depositStatus: "awaiting_payment", depositCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_open", depositCheckoutExpiresAt: new Date(NOW.getTime() + 5 * 3600_000), bookingStatus: "requested" };
    const a = fakeDeposits();
    expect(await ask({ ...setup(quote(open)).deps, deposits: a.deposits } as never)).toMatchObject({ status: "already_requested", deposit: { paymentLink: "https://checkout.stripe.com/c/pay/cs_open" } });
    expect(a.made).toHaveLength(0);
    const b = fakeDeposits();
    const expired = { ...open, depositCheckoutExpiresAt: new Date(NOW.getTime() - 60_000) };
    expect(await ask({ ...setup(quote(expired)).deps, deposits: b.deposits } as never)).toMatchObject({ status: "already_requested", deposit: { paymentLink: "https://checkout.stripe.com/c/pay/cs_test_1" } });
    const c = fakeDeposits();
    expect(await ask({ ...setup(quote({ ...open, depositStatus: "paid" })).deps, deposits: c.deposits } as never)).toMatchObject({ deposit: { paid: true, paymentLink: null } });
    expect(c.made).toHaveLength(0);
  });

  it("if Stripe fails, the customer is told a link is coming and the team is told to send one", async () => {
    const { deps, sent } = setup(quote());
    const { deposits } = fakeDeposits(true);
    expect(await ask({ ...deps, deposits } as typeof deps)).toMatchObject({ ok: true, status: "requested", deposit: { paymentLink: null } });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("NO PAYMENT LINK SET UP");
  });

  it("without a payment link set up, the customer is told one is coming and the team is told to send it", async () => {
    const { deps, sent } = setup(quote());
    await ask(deps);
    expect(sent.find((e) => e.kind === "customer")!.text).toContain("We will send you a secure payment link");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("NO PAYMENT LINK SET UP");
  });

  it("a move less than a week away takes no deposit", async () => {
    const { deps, sent } = setup(quote({ movingDate: "2026-10-16" })); // 4 days away
    expect(await ask(deps)).toMatchObject({ ok: true, deposit: { required: false, daysUntilMove: 4 } });
    expect(sent.find((e) => e.kind === "customer")!.text).not.toContain("deposit");
    expect(sent.find((e) => e.kind === "team")!.text).not.toContain("DEPOSIT");
  });

  it("check_availability says up front whether the deposit applies", async () => {
    const out = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, setup(quote()).deps);
    expect(out).toMatchObject({ ok: true, deposit: { required: true, amountAud: 100 } });
  });
});

describe("deposit paid -> confirmed automatically if the time is still free", () => {
  // Booking request for Wed 21 Oct at 07:30 (9 days away).
  const requested = (over: Partial<StoredQuote> = {}) => quote({ bookingStatus: "requested", bookingArrivalTime: "07:30", depositStatus: "paid", ...over });

  it("books it into the calendar, emails the team, the customer and the driver -- even with the instant switch off", async () => {
    const drivers: string[] = [];
    const { deps, sent, calendar, row } = setup(requested(), { ...READY, autoConfirm: false });
    const out = await confirmPaidBooking("BLR-20261012-ABC123", false, { ...deps, notifyDriver: async (t: { quoteReference?: string }) => (drivers.push(t.quoteReference ?? ""), null) } as never);
    expect(out).toEqual({ outcome: "confirmed", emailed: true, arrivalTime: "07:30", date: "2026-10-21" });
    expect(row()).toMatchObject({ bookingStatus: "confirmed" });
    expect(calendar).toHaveLength(1);
    expect(calendar[0]).toMatchObject({ arrivalTime: "07:30", truckId: "truck-a", createdBy: "deposit paid (confirmed automatically)" });
    const team = sent.find((e) => e.kind === "team")!;
    expect(team.subject).toContain("Booked + deposit paid");
    expect(team.text).toContain("DEPOSIT: $100 PAID");
    expect(sent.some((e) => e.kind === "customer")).toBe(true);
    expect(drivers).toEqual(["BLR-20261012-ABC123"]);
  });

  it("goes to the team when the time was taken in the meantime, arrival times aren't set up, or no time was chosen", async () => {
    const taken = setup(requested(), READY);
    taken.calendar.push({ arrivalTime: "07:30", estimatedMinutes: 300, truckType: "6-8T", truckId: "truck-a", movers: 2 } as NewCalendarBooking);
    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, taken.deps)).toMatchObject({ outcome: "needs_team" });
    expect(taken.row()).toMatchObject({ bookingStatus: "requested" });

    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, setup(requested(), NOT_SET_UP).deps)).toMatchObject({ outcome: "needs_team", problem: expect.stringContaining("aren't set up") });
    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, setup(requested({ bookingArrivalTime: null }), READY).deps)).toMatchObject({ outcome: "needs_team", problem: expect.stringContaining("arrival time") });
  });

  it("never books a test-price estimate on a real payment; already confirmed or cancelled is left alone", async () => {
    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, setup(requested({ rateCardStatus: "placeholder" }), READY).deps)).toMatchObject({ outcome: "needs_team" });
    expect(await confirmPaidBooking("BLR-20261012-ABC123", true, setup(requested({ rateCardStatus: "placeholder" }), READY).deps)).toMatchObject({ outcome: "confirmed" });
    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, setup(requested({ bookingStatus: "confirmed" }), READY).deps)).toEqual({ outcome: "already_confirmed" });
    expect(await confirmPaidBooking("BLR-20261012-ABC123", false, setup(requested({ bookingStatus: null }), READY).deps)).toMatchObject({ outcome: "needs_team" });
  });
});
