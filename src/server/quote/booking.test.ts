import { describe, expect, it } from "vitest";
import type { CapacitySettings, CapacitySnapshot } from "../capacity/availability.js";
import type { NewCalendarBooking } from "../capacity/store.js";
import { availabilityForQuote, confirmBooking, requestBooking, type BookingStore, type StoredQuote } from "./booking.js";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION } from "./bookingEmails.js";
import { fixtureRateCard } from "./rateCard.fixture.js";
import type { OutgoingEmail } from "./service.js";

const NOW = new Date("2026-10-12T02:00:00Z"); // Mon 12 Oct, 13:00 in Melbourne

const quote = (over: Partial<StoredQuote> = {}): StoredQuote => ({
  reference: "BLR-20261012-ABC123",
  conversationId: "conv-1",
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
  internalBreakdown: { truck: "6-8T", movers: 2, jobHours: 4.5 },
  rateCardSnapshot: fixtureRateCard,
  rateCardStatus: "confirmed",
  bookingStatus: null,
  bookingNotes: null,
  bookingArrivalTime: null,
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

function setup(stored: StoredQuote | null, settings: CapacitySettings = NOT_SET_UP) {
  const sent: OutgoingEmail[] = [];
  const calendar: NewCalendarBooking[] = [];
  let row = stored;
  const capacity = (): Omit<CapacitySnapshot, "nowLocal"> => ({
    settings,
    trucks: [{ id: "truck-a", truckType: "6-8T", active: true }],
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

const ask = (deps: ReturnType<typeof setup>["deps"], over: Partial<Parameters<typeof requestBooking>[0]> = {}) =>
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
    expect(out).toMatchObject({ ok: true, onlineBookingOpen: false, availableTimes: [], instantConfirm: false });
  });
});

describe("instant confirmation (switched on by the team, everything set up)", () => {
  it("offers the free arrival times and says they'd be confirmed on the spot", async () => {
    const out = await availabilityForQuote({ reference: "BLR-20261012-ABC123", conversationId: "conv-1" }, setup(quote(), READY).deps);
    expect(out).toEqual({ ok: true, date: "2026-10-21", onlineBookingOpen: true, availableTimes: ["07:30", "12:00"], instantConfirm: true });
  });

  it("books it, adds it to the calendar with the truck, and emails 'your move is booked'", async () => {
    const { deps, sent, calendar, row } = setup(quote(), READY);
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "confirmed", arrivalTime: "07:30", emailed: true });
    expect(calendar[0]).toMatchObject({ quoteReference: "BLR-20261012-ABC123", date: "2026-10-21", arrivalTime: "07:30", truckId: "truck-a", movers: 2, estimatedMinutes: 270, source: "chat" });
    expect(row()!.bookingStatus).toBe("confirmed");
    expect(sent.find((e) => e.kind === "customer")!.subject).toContain("Your move is booked");
    expect(sent.find((e) => e.kind === "customer")!.text).toContain("Arrival time: 7:30am");
    expect(sent.find((e) => e.kind === "team")!.subject).toMatch(/^Booked:/);
  });

  it("a taken time is refused with the times still free", async () => {
    const { deps, calendar } = setup(quote(), READY);
    calendar.push({ source: "phone", date: "2026-10-21", arrivalTime: "07:30", estimatedMinutes: 240, truckType: "6-8T", truckId: "truck-a", movers: 2 });
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: false, reason: "time_unavailable", availableTimes: ["12:00"] });
  });

  it("if another customer takes the time at the same moment, it backs out instead of double-booking", async () => {
    const { deps, calendar } = setup(quote(), READY);
    const original = deps.bookings.confirm;
    deps.bookings.confirm = async (ref, date, decide, fields) => {
      calendar.push({ source: "chat", date, arrivalTime: "07:30", estimatedMinutes: 600, truckType: "6-8T", truckId: "truck-a", movers: 2 }); // the other customer
      return original(ref, date, decide, fields);
    };
    expect(await ask(deps, { arrivalTime: "07:30" })).toMatchObject({ ok: false, reason: "time_unavailable" });
    expect(calendar).toHaveLength(1);
  });

  it("over the instant-confirm limit, or in test mode, it becomes a request for the team", async () => {
    expect(await ask(setup(quote(), { ...READY, autoConfirmMaxAud: 500 }).deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested", arrivalTime: "07:30" });
    expect(await ask(setup(quote({ rateCardStatus: "placeholder" }), READY).deps, { arrivalTime: "07:30" })).toMatchObject({ ok: true, status: "requested" });
  });
});

describe("the team confirms on the dashboard", () => {
  it("needs an arrival time, adds the booking to the calendar, and emails the customer", async () => {
    const { deps, sent, calendar } = setup(quote());
    await ask(deps);
    sent.length = 0;
    expect(await confirmBooking({ reference: "BLR-20261012-ABC123", confirmedBy: "user_sam" }, deps)).toMatchObject({ ok: false, reason: "time_needed" });
    const out = await confirmBooking({ reference: "BLR-20261012-ABC123", arrivalTime: "08:00", confirmedBy: "user_sam" }, deps);
    expect(out).toMatchObject({ ok: true, status: "confirmed", emailed: true, capacityWarning: "not_set_up" });
    expect(calendar[0]).toMatchObject({ arrivalTime: "08:00", createdBy: "user_sam" });
    expect(sent[0]!.subject).toContain("Your move is booked");
    expect(sent[0]!.text).toContain(BOOKING_TERMS); // final charges are still confirmed on the day
  });

  it("uses the customer's chosen time, and warns (but allows) when the calendar shows no room", async () => {
    const { deps, calendar } = setup(quote(), { ...READY, autoConfirm: false });
    await ask(deps, { arrivalTime: "12:00" });
    calendar.push({ source: "phone", date: "2026-10-21", arrivalTime: "11:00", estimatedMinutes: 300, truckType: "6-8T", truckId: "truck-a", movers: 2 });
    const out = await confirmBooking({ reference: "BLR-20261012-ABC123", confirmedBy: "user_sam" }, deps);
    expect(out).toMatchObject({ ok: true, arrivalTime: "12:00", capacityWarning: "no_truck" });
  });

  it("refuses to confirm something that wasn't requested", async () => {
    expect(await confirmBooking({ reference: "BLR-20261012-ABC123", arrivalTime: "08:00", confirmedBy: "x" }, setup(quote()).deps)).toMatchObject({ ok: false, reason: "not_pending" });
  });
});
