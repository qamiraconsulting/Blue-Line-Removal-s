import { describe, expect, it } from "vitest";
import type { CapacitySnapshot } from "../capacity/availability.js";
import type { NewCalendarBooking } from "../capacity/store.js";
import { fixtureRateCard } from "../quote/rateCard.fixture.js";
import type { OutgoingEmail } from "../quote/service.js";
import {
  applyEdits,
  cancelAction,
  completeAction,
  confirmAction,
  rejectAction,
  sendQuoteAction,
  type JobDeps,
  type JobPatch,
  type JobRow,
  type JobStore,
} from "./actions.js";
import { finishLines, linesFromEstimate, teamQuote } from "./lines.js";
import { summarise, type OverviewRow } from "./overview.js";
import { appsScriptPayload, appsScriptSender, pdfDate, type PdfQuoteJob } from "./pdfQuote.js";
import { effectiveStatus } from "./status.js";

const NOW = new Date("2026-10-15T02:00:00Z"); // Thu 15 Oct 2026, 13:00 in Melbourne
const card = fixtureRateCard;

describe("PDF quote lines always add up to the total", () => {
  it("an instant estimate: rate x hours = labour; discount and rounding land on the adjustment line", () => {
    const l = linesFromEstimate(
      { truck: "6-8T", movers: 2, capacityFrom: "guide", jobHours: 4.5, crewRateAudPerHour: 140, labourCostAud: 630, accessCostAud: 0, surchargeAppliedPercent: 0, subtotalAud: 630, discountPercent: 0, discountAud: 0, gstAud: 63, unroundedAud: 693 },
      720,
      card,
    );
    expect(l).toMatchObject({ truck: "6-8T", movers: 2, hours: 4.5, rateHr: 140, labour: 630, callOut: 0, gst: 65.45, subtotal: 654.55, adjustment: 24.55, total: 720 });
    expect(l.labour + l.callOut + l.packing + l.stair + l.adjustment).toBeCloseTo(l.subtotal, 2);
    expect(l.subtotal + l.gst).toBeCloseTo(l.total, 2);
  });

  it("team edits recalculate from the same rate card (extra movers, stairs, packing, minimum hours)", () => {
    const r = teamQuote({ truck: "4.5T", movers: 2, hours: 3, stairFlights: 1, packingAud: 50, firstMoveApplied: false, overrideTotal: null }, card);
    expect(r).toMatchObject({ ok: true, calculatedTotal: 530, lines: { labour: 390, stair: 40, packing: 50, total: 530, adjustment: 1.82 } });
    expect(teamQuote({ truck: "4.5T", movers: 3, hours: 3, stairFlights: 0, packingAud: 0, firstMoveApplied: false, overrideTotal: null }, card)).toMatchObject({ ok: true, lines: { rateHr: 210, labour: 630 } });
    expect(teamQuote({ truck: "4.5T", movers: 2, hours: 1, stairFlights: 0, packingAud: 0, firstMoveApplied: false, overrideTotal: null }, card)).toMatchObject({ ok: true, lines: { hours: 2, labour: 260 } });
  });

  it("keeps the first-order discount, and the team's own total wins (difference on the adjustment line)", () => {
    expect(teamQuote({ truck: "4.5T", movers: 2, hours: 3, stairFlights: 1, packingAud: 50, firstMoveApplied: true, overrideTotal: null }, card)).toMatchObject({ ok: true, lines: { total: 480, adjustment: -43.64 } });
    const o = teamQuote({ truck: "4.5T", movers: 2, hours: 3, stairFlights: 1, packingAud: 50, firstMoveApplied: false, overrideTotal: 600 }, card);
    expect(o).toMatchObject({ ok: true, calculatedTotal: 530, lines: { total: 600, gst: 54.55, subtotal: 545.45, adjustment: 65.45 } });
  });

  it("a total alone is enough when there's nothing to calculate from; nothing at all is refused", () => {
    expect(teamQuote({ truck: null, movers: null, hours: null, stairFlights: 0, packingAud: 0, firstMoveApplied: false, overrideTotal: 450 }, card)).toMatchObject({ ok: true, lines: { total: 450, labour: 0, adjustment: 409.09 } });
    expect(teamQuote({ truck: null, movers: null, hours: null, stairFlights: 0, packingAud: 0, firstMoveApplied: false, overrideTotal: null }, card)).toMatchObject({ ok: false });
    expect(finishLines({ truck: null, movers: null, hours: null, rateHr: null, stairFlights: 0, labour: 100, callOut: 0, packing: 0, stair: 0, services: "x" }, 110, 10)).toMatchObject({ subtotal: 100, gst: 10, adjustment: 0 });
  });
});

// ------------------------------------------------------------------ team actions

function jobRow(over: Partial<JobRow> = {}): JobRow {
  return {
    id: "id-1",
    reference: "BLR-20261015-ABC123",
    createdAt: NOW,
    source: "quote_form",
    conversationId: null,
    status: "priced",
    manualReason: null,
    customerName: "Jane Smith",
    phone: "0412 345 678",
    email: "jane@example.com",
    emailNormalised: "jane@example.com",
    phoneNormalised: "0412345678",
    need: "moving",
    propertySize: "2_bed",
    truck: null,
    movers: null,
    accessNotes: null,
    jobDescription: null,
    movingDate: "2026-10-21",
    fromText: "Preston",
    toText: "Brunswick",
    firstMoveRequested: false,
    firstMoveApplied: false,
    amountAud: 720,
    validUntil: "2026-10-25",
    rateCardVersion: "test-v1",
    rateCardStatus: "confirmed",
    inputs: {},
    internalBreakdown: { truck: "6-8T", movers: 2, capacityFrom: "guide", jobHours: 4.5, crewRateAudPerHour: 145, labourCostAud: 652.5, accessCostAud: 0 },
    rateCardSnapshot: card,
    customerEmailSentAt: null,
    bookingStatus: "requested",
    bookingRequestedAt: NOW,
    bookingConfirmedAt: null,
    bookingTermsVersion: "2026-10-12",
    bookingTermsText: "terms",
    bookingNotes: null,
    bookingArrivalTime: "07:30",
    depositStatus: null,
    depositCheckoutId: null,
    depositCheckoutUrl: null,
    depositCheckoutExpiresAt: null,
    depositPaidAt: null,
    depositAmountCents: null,
    depositPaymentMethod: null,
    depositPaymentIntentId: null,
    depositTestMode: null,
    jobStatus: "booking_requested",
    statusUpdatedAt: NOW,
    channel: null,
    externalRef: null,
    platformJobNumber: null,
    customerNotes: null,
    bookingToken: "a".repeat(32),
    quoteLines: null,
    quotedAmountAud: null,
    changeNote: null,
    quoteSentAt: null,
    quoteSentBy: null,
    calendarIssue: null,
    finalAmountAud: null,
    completedAt: null,
    closedReason: null,
    closedBy: null,
    ...over,
  };
}

function setup(start: JobRow, opts: { pdf?: boolean; pdfFails?: boolean; testEmailTo?: string } = {}) {
  let row = start;
  const calendar: NewCalendarBooking[] = [];
  const sent: OutgoingEmail[] = [];
  const pdfs: PdfQuoteJob[] = [];
  const capacity = (): Omit<CapacitySnapshot, "nowLocal"> => ({
    settings: { autoConfirm: false, workingDays: [1, 2, 3, 4, 5, 6], arrivalTimes: ["07:30"], dayEndTime: "18:00", bufferMinutes: 30, moversPerDay: 4, minNoticeHours: 24, maxDaysAhead: 60, autoConfirmMaxAud: null },
    trucks: [{ id: "truck-a", truckType: "6-8T", active: true }],
    override: null,
    bookings: [],
  });
  const apply = (patch: JobPatch) => (row = { ...row, ...(patch as Partial<JobRow>) });
  const jobs: JobStore = {
    find: async (ref) => (ref === row.reference ? row : null),
    update: async (_ref, from, patch) => (from.includes(row.jobStatus) ? (apply(patch), true) : false),
    loadCapacity: async () => capacity(),
    book: async (_ref, from, _date, decide, patch) => {
      if (!from.includes(row.jobStatus)) return null;
      const d = decide(capacity());
      calendar.push(d.booking);
      apply(patch);
      return d.result;
    },
    cancelCalendar: async () => {
      calendar.forEach((b) => (b.status = "cancelled"));
    },
  };
  const deps: JobDeps = {
    jobs,
    rateCard: card,
    now: () => NOW,
    sendEmail: async (e) => (sent.push(e), true),
    customerReplyTo: "hello@example.com",
    testEmailTo: opts.testEmailTo ?? null,
    pdf: opts.pdf ? async (job) => (pdfs.push(job), !opts.pdfFails) : undefined,
  };
  return { deps, row: () => row, calendar, sent, pdfs };
}

describe("the team confirms a booking request -- with or without changes", () => {
  it("as estimated: into the calendar, status booked, PDF marked Confirmed", async () => {
    const { deps, row, calendar, pdfs } = setup(jobRow(), { pdf: true });
    const out = await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: true, by: "user_sam" }, deps);
    expect(out).toMatchObject({ ok: true, status: "booked", emailed: true, via: "pdf", total: 720 });
    expect(row()).toMatchObject({ jobStatus: "booked", bookingStatus: "confirmed", bookingArrivalTime: "07:30", quotedAmountAud: 720 });
    expect(calendar[0]).toMatchObject({ source: "web_form", date: "2026-10-21", arrivalTime: "07:30", truckType: "6-8T", movers: 2, estimatedMinutes: 270, createdBy: "user_sam" });
    expect(pdfs[0]).toMatchObject({ kind: "booked", to: "jane@example.com", reference: "BLR-20261015-ABC123", note: null });
  });

  it("with changes: new date, more hours and the team's own total, plus a note the customer sees", async () => {
    const { deps, row, calendar, pdfs } = setup(jobRow(), { pdf: true });
    const out = await confirmAction(
      { reference: "BLR-20261015-ABC123", edits: { movingDate: "2026-10-22", arrivalTime: "12:00", hours: 6, overrideTotal: 950, note: "Extra hour for the 3rd-floor walk-up." }, notifyCustomer: true, by: "user_sam" },
      deps,
    );
    expect(out).toMatchObject({ ok: true, total: 950 });
    expect(row()).toMatchObject({ movingDate: "2026-10-22", bookingArrivalTime: "12:00", quotedAmountAud: 950, changeNote: "Extra hour for the 3rd-floor walk-up.", amountAud: 720 });
    expect(calendar[0]).toMatchObject({ date: "2026-10-22", arrivalTime: "12:00", estimatedMinutes: 360 });
    expect(pdfs[0]).toMatchObject({ note: "Extra hour for the 3rd-floor walk-up.", movingDate: "2026-10-22", lines: { hours: 6, total: 950 } });
  });

  it("falls back to a plain email when the PDF can't be made", async () => {
    const { deps, sent } = setup(jobRow(), { pdf: true, pdfFails: true });
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: true, by: "x" }, deps)).toMatchObject({ ok: true, emailed: true, via: "email" });
    expect(sent[0]).toMatchObject({ kind: "customer", to: "jane@example.com" });
    expect(sent[0]!.subject).toContain("Your move is booked");
  });

  it("needs an arrival time and the truck/crew/hours for the calendar", async () => {
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: false, by: "x" }, setup(jobRow({ bookingArrivalTime: null })).deps)).toMatchObject({ ok: false, code: "details_needed" });
    const manual = jobRow({ status: "manual_review", amountAud: null, internalBreakdown: null, jobStatus: "waiting_for_quote" });
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: { overrideTotal: 500 }, notifyCustomer: false, by: "x" }, setup(manual).deps)).toMatchObject({ ok: false, code: "details_needed" });
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: { truck: "4.5T", movers: 2, hours: 3 }, notifyCustomer: false, by: "x" }, setup(manual).deps)).toMatchObject({ ok: true, status: "booked" });
  });

  it("test figures only ever reach the test inbox", async () => {
    const test = jobRow({ rateCardStatus: "placeholder" });
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: true, by: "x" }, setup(test).deps)).toMatchObject({ ok: true, emailed: false });
    const { deps, sent } = setup(test, { testEmailTo: "tester@example.com" });
    await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: true, by: "x" }, deps);
    expect(sent[0]).toMatchObject({ to: "tester@example.com" });
    expect(sent[0]!.subject.startsWith("[TEST]")).toBe(true);
  });

  it("won't confirm twice", async () => {
    const { deps } = setup(jobRow({ jobStatus: "booked" }));
    expect(await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: false, by: "x" }, deps)).toMatchObject({ ok: false, code: "not_allowed" });
  });
});

describe("the team's other actions", () => {
  it("send a quote for a 'waiting for quote' request: status quoted, valid-until set, PDF not confirmed", async () => {
    const manual = jobRow({ status: "manual_review", amountAud: null, internalBreakdown: null, jobStatus: "waiting_for_quote", bookingStatus: null });
    const { deps, row, pdfs } = setup(manual, { pdf: true });
    const out = await sendQuoteAction({ reference: "BLR-20261015-ABC123", edits: { truck: "4.5T", movers: 2, hours: 3, stairFlights: 1, packingAud: 50, note: "Includes boxes." }, notifyCustomer: true, by: "user_sam" }, deps);
    expect(out).toMatchObject({ ok: true, status: "quoted", total: 530, via: "pdf" });
    expect(row()).toMatchObject({ jobStatus: "quoted", quotedAmountAud: 530, validUntil: "2026-10-29", quoteSentBy: "user_sam" });
    expect(pdfs[0]).toMatchObject({ kind: "quote", validUntil: "2026-10-29", note: "Includes boxes." });
  });

  it("applyEdits leaves the price alone when only the date or addresses change", () => {
    const r = applyEdits(jobRow(), { movingDate: "2026-10-23", toText: "Carlton" }, card);
    expect(r).toMatchObject({ ok: true, lines: { total: 720 }, patch: { movingDate: "2026-10-23", toText: "Carlton", quotedAmountAud: 720 } });
  });

  it("tells the truck's driver when the team confirms a booking, and again if it is cancelled", async () => {
    const told: unknown[] = [];
    const notifyDriver = async (target: unknown) => (told.push(target), { status: "unchanged" as const });
    const { deps } = setup(jobRow());
    await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: false, by: "x" }, { ...deps, notifyDriver });
    await cancelAction({ reference: "BLR-20261015-ABC123", reason: "Customer changed plans", by: "x" }, { ...deps, notifyDriver });
    expect(told).toEqual([{ quoteReference: "BLR-20261015-ABC123" }, { quoteReference: "BLR-20261015-ABC123" }]);
  });

  it("a driver email that fails never stops the team confirming", async () => {
    const { deps, row } = setup(jobRow());
    const out = await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: false, by: "x" }, { ...deps, notifyDriver: async () => Promise.reject(new Error("down")) });
    expect(out).toMatchObject({ ok: true, status: "booked" });
    expect(row()!.jobStatus).toBe("booked");
  });

  it("reject (with an optional note to the customer), cancel, complete", async () => {
    const r = setup(jobRow());
    expect(await rejectAction({ reference: "BLR-20261015-ABC123", reason: "Outside our area", messageToCustomer: "Sorry, that's outside the area we cover.", by: "x" }, r.deps)).toMatchObject({ ok: true, status: "rejected", emailed: true });
    expect(r.row()).toMatchObject({ jobStatus: "rejected", closedReason: "Outside our area" });

    const b = setup(jobRow());
    await confirmAction({ reference: "BLR-20261015-ABC123", edits: {}, notifyCustomer: false, by: "x" }, b.deps);
    expect(await cancelAction({ reference: "BLR-20261015-ABC123", reason: "Customer changed plans", by: "x" }, b.deps)).toMatchObject({ ok: true, status: "cancelled" });
    expect(b.calendar[0]!.status).toBe("cancelled");
    expect(b.row()).toMatchObject({ jobStatus: "cancelled", bookingStatus: "cancelled" });

    const c = setup(jobRow({ jobStatus: "booked", bookingStatus: "confirmed" }));
    expect(await completeAction({ reference: "BLR-20261015-ABC123", finalAmountAud: 780, by: "x" }, c.deps)).toMatchObject({ ok: true, status: "completed" });
    expect(c.row()).toMatchObject({ jobStatus: "completed", finalAmountAud: 780 });
    expect(await completeAction({ reference: "BLR-20261015-ABC123", finalAmountAud: 1, by: "x" }, c.deps)).toMatchObject({ ok: false });
  });
});

// ------------------------------------------------------------------ status + overview

describe("status and the Overview", () => {
  it("an unbooked estimate past its date shows as lost; a booked job past its date needs marking complete", () => {
    expect(effectiveStatus({ jobStatus: "estimate_sent", validUntil: "2026-10-14", movingDate: "2026-10-30" }, "2026-10-15")).toEqual({ status: "lost", toComplete: false });
    expect(effectiveStatus({ jobStatus: "quoted", validUntil: null, movingDate: "2026-10-16" }, "2026-10-15")).toEqual({ status: "quoted", toComplete: false });
    expect(effectiveStatus({ jobStatus: "booked", validUntil: null, movingDate: "2026-10-14" }, "2026-10-15")).toEqual({ status: "booked", toComplete: true });
  });

  it("counts by channel and status, with what's waiting right now", () => {
    const base: OverviewRow = { reference: "", createdAt: "2026-10-10T01:00:00Z", source: "quote_form", channel: null, jobStatus: "estimate_sent", validUntil: "2026-10-20", movingDate: "2026-10-25", amountAud: 700, quotedAmountAud: null, finalAmountAud: null, completedAt: null, statusUpdatedAt: "2026-10-10T01:00:00Z" };
    const rows: OverviewRow[] = [
      { ...base, reference: "a" },
      { ...base, reference: "b", source: "chatbot", jobStatus: "waiting_for_quote", amountAud: null, createdAt: "2026-10-14T23:00:00Z" },
      { ...base, reference: "c", source: "chatbot", jobStatus: "booked", movingDate: "2026-10-18" },
      { ...base, reference: "d", source: "team_form", channel: "airtasker", jobStatus: "completed", quotedAmountAud: 900, finalAmountAud: 950, completedAt: "2026-10-12T05:00:00Z" },
      { ...base, reference: "e", jobStatus: "estimate_sent", validUntil: "2026-10-12" }, // expired -> lost
      { ...base, reference: "f", createdAt: "2026-08-01T01:00:00Z" }, // before the period
    ];
    const s = summarise(rows, "2026-10-15", "2026-10-01", "2026-10-15");
    expect(s.now).toMatchObject({ waitingForQuote: 1, oldestWaitingSince: "2026-10-14T23:00:00Z", estimatesNotBooked: 2, bookedNext7Days: { jobs: 1, valueAud: 700 } });
    expect(s.byChannel).toEqual({
      quote_form: { total: 2, estimate_sent: 1, lost: 1 },
      chatbot: { total: 2, waiting_for_quote: 1, booked: 1 },
      airtasker: { total: 1, completed: 1 },
    });
    expect(s.inPeriod).toMatchObject({ requests: 5, booked: 2, conversionPercent: 40, completed: { jobs: 1, revenueAud: 950 }, lost: 1 });
  });
});

// ------------------------------------------------------------------ the Apps Script call

const pdfJob: PdfQuoteJob = {
  kind: "booked",
  to: "jane@example.com",
  reference: "BLR-20261015-ABC123",
  customerName: "Jane Smith",
  email: "jane@example.com",
  phone: "0412 345 678",
  movingDate: "2026-10-21",
  arrivalTime: "07:30",
  from: "Preston",
  toAddress: "Brunswick",
  lines: finishLines({ truck: "6-8T", movers: 2, hours: 4.5, rateHr: 145, stairFlights: 0, labour: 652.5, callOut: 0, packing: 0, stair: 0, services: "Standard Move" }, 720, 10),
  truckLabel: "6-8 tonne truck",
  note: "Moved to 7:30 as discussed.",
  validUntil: null,
  testMode: false,
};

describe("the branded PDF via the Apps Script", () => {
  it("fills the template's own placeholders, money as 0.00, status Confirmed", () => {
    const p = appsScriptPayload(pdfJob, "2026-10-15", "s3cret");
    expect(p).toMatchObject({ secret: "s3cret", action: "sendQuote", to: "jane@example.com" });
    expect(p.values).toMatchObject({
      CustomerName: "Jane Smith",
      MoveDate: "Wednesday, 21 October 2026, arrival 7:30am",
      Crew: "2 movers, 6-8 tonne truck",
      BookingStatus: "Confirmed",
      BookingNo: "BLR-20261015-ABC123",
      Hours: "4.5",
      RateHr: "145.00",
      Labour: "652.50",
      CallOut: "0.00",
      Adjustment: "2.05",
      Subtotal: "654.55",
      GST: "65.45",
      Total: "720.00",
      DaysUntilMove: "6",
    });
    expect(p.introText).toContain("A note from our team: Moved to 7:30 as discussed.");
    expect(pdfDate("2026-10-21")).toBe("Wednesday, 21 October 2026");
  });

  it("reports success only when the script says ok", async () => {
    const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const config = { url: "https://script.example/exec", secret: "s", today: () => "2026-10-15" };
    expect(await appsScriptSender(config, reply({ ok: true }))(pdfJob)).toBe(true);
    expect(await appsScriptSender(config, reply({ ok: false, error: "bad secret" }))(pdfJob)).toBe(false);
    expect(await appsScriptSender(config, reply({}, 500))(pdfJob)).toBe(false);
    expect(await appsScriptSender(config, (async () => { throw new Error("down"); }) as unknown as typeof fetch)(pdfJob)).toBe(false);
  });
});
