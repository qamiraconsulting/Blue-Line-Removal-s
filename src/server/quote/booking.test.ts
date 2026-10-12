import { describe, expect, it } from "vitest";
import { confirmBooking, requestBooking, type BookingStore, type StoredQuote } from "./booking.js";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION } from "./bookingEmails.js";
import { fixtureRateCard } from "./rateCard.fixture.js";
import type { OutgoingEmail } from "./service.js";

const NOW = new Date("2026-10-12T02:00:00Z"); // 12 Oct in Melbourne

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
  movingDate: "2026-10-24",
  fromText: "Preston",
  toText: "Brunswick",
  internalBreakdown: { truck: "6-8T", movers: 2 },
  rateCardSnapshot: fixtureRateCard,
  rateCardStatus: "confirmed",
  bookingStatus: null,
  bookingNotes: null,
  ...over,
});

function setup(stored: StoredQuote | null) {
  const sent: OutgoingEmail[] = [];
  const marks: Array<{ reference: string; termsVersion: string; termsText: string; notes: string | null }> = [];
  let row = stored;
  const bookings: BookingStore = {
    findQuote: async (ref) => (row && row.reference === ref ? row : null),
    markRequested: async (reference, b) => {
      if (!row || row.bookingStatus) return false;
      marks.push({ reference, ...b });
      row = { ...row, bookingStatus: "requested", bookingNotes: b.notes };
      return true;
    },
    markConfirmed: async () => {
      if (!row || row.bookingStatus !== "requested") return false;
      row = { ...row, bookingStatus: "confirmed" };
      return true;
    },
  };
  const deps = {
    bookings,
    sendEmail: async (e: OutgoingEmail) => (sent.push(e), true),
    teamEmail: "team@example.com",
    customerReplyTo: "hello@example.com",
    now: () => NOW,
  };
  return { deps, sent, marks };
}

const ask = (deps: ReturnType<typeof setup>["deps"], over: Partial<Parameters<typeof requestBooking>[0]> = {}) =>
  requestBooking({ reference: "BLR-20261012-ABC123", conversationId: "conv-1", notes: "Morning if possible", ...over }, deps);

describe("booking on an estimate (inspection on the move day)", () => {
  it("records the request with the exact terms agreed, emails the team and the customer", async () => {
    const { deps, sent, marks } = setup(quote());
    expect(await ask(deps)).toEqual({ ok: true, status: "requested", reference: "BLR-20261012-ABC123", emailed: true });
    expect(marks[0]).toEqual({ reference: "BLR-20261012-ABC123", termsVersion: BOOKING_TERMS_VERSION, termsText: BOOKING_TERMS, notes: "Morning if possible" });

    const team = sent.find((e) => e.kind === "team")!;
    expect(team.subject).toContain("Booking request");
    expect(team.text).toContain(BOOKING_TERMS);
    expect(team.text).toContain("Phone: 0412 345 678");

    const customer = sent.find((e) => e.kind === "customer")!;
    expect(customer.to).toBe("jane@example.com");
    expect(customer.subject).toContain("received your booking request");
    expect(customer.text).toContain(BOOKING_TERMS);
    expect(customer.text).toContain("Truck & crew: 6-8 tonne truck, 2 movers");
    expect(customer.text).toContain("confirm your booking shortly");
    expect(customer.text).not.toMatch(/is booked|confirmed booking/i);
  });

  it("accepts the reference in any case, and is idempotent", async () => {
    const { deps, sent } = setup(quote());
    await ask(deps, { reference: "blr-20261012-abc123" });
    sent.length = 0;
    expect(await ask(deps)).toMatchObject({ ok: true, status: "already_requested" });
    expect(sent).toHaveLength(0);
  });

  it("only books an estimate made in the same chat", async () => {
    const { deps } = setup(quote());
    expect(await ask(deps, { conversationId: "someone-else" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await ask(deps, { reference: "BLR-NOPE" })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("won't book a personal-quote job (no estimate to agree to)", async () => {
    const { deps } = setup(quote({ status: "manual_review", amountAud: null }));
    expect(await ask(deps)).toMatchObject({ ok: false, reason: "no_estimate" });
  });

  it("won't book an expired estimate or a date that has passed", async () => {
    expect(await ask(setup(quote({ validUntil: "2026-10-11" })).deps)).toMatchObject({ ok: false, reason: "expired" });
    expect(await ask(setup(quote({ movingDate: "2026-10-01" })).deps)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("test-mode estimates are never emailed to the customer, but the team still hears about it", async () => {
    const { deps, sent } = setup(quote({ rateCardStatus: "placeholder" }));
    expect(await ask(deps)).toMatchObject({ ok: true, status: "requested", emailed: false });
    expect(sent.map((e) => e.kind)).toEqual(["team"]);
    expect(sent[0]!.text).toContain("TEST MODE");
  });

  it("an inspection request is described as confirmed on the day", async () => {
    const { deps, sent } = setup(quote({ truck: "inspect" }));
    await ask(deps);
    expect(sent.find((e) => e.kind === "customer")!.text).toContain("6-8 tonne truck, 2 movers (confirmed on the day)");
  });
});

describe("the team confirms the booking", () => {
  it("confirms a pending request and emails the customer that the move is booked", async () => {
    const { deps, sent } = setup(quote());
    await ask(deps);
    sent.length = 0;
    expect(await confirmBooking("BLR-20261012-ABC123", deps)).toMatchObject({ ok: true, status: "confirmed", emailed: true });
    expect(sent[0]).toMatchObject({ kind: "customer", to: "jane@example.com" });
    expect(sent[0]!.subject).toContain("Your move is booked");
    expect(sent[0]!.text).toContain(BOOKING_TERMS); // the final charges are still confirmed on the day
  });

  it("refuses to confirm something that wasn't requested", async () => {
    const { deps } = setup(quote());
    expect(await confirmBooking("BLR-20261012-ABC123", deps)).toMatchObject({ ok: false, reason: "not_pending" });
  });
});
