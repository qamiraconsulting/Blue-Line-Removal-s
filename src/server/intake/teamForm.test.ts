import { describe, expect, it } from "vitest";
import { calendarProblem, parseChannel, parseMovers, parseStatus, parseTeamForm, parseTruck, type TeamFormPayload } from "./teamForm.js";

// A row like Ayesha's sample from Matt's sheet (2026-10-15), with the five new questions.
const payload = (over: { data?: Record<string, unknown>; values?: Record<string, unknown> } & Partial<TeamFormPayload> = {}): TeamFormPayload => ({
  moveDateIso: "2026-10-21",
  arrivalTime: "08:00",
  ...over,
  data: {
    "Customer Name": "Sam Lee",
    "Job type": "Residential Moving",
    Items: "Sofa, bed, 20 boxes",
    "Crew": "2 men 1 truck",
    "Booking Status": "Confirmed",
    Source: "Airtasker",
    "Truck size": "4.5T",
    "Website or chat reference": "",
    "Platform job number": "AT-55120",
    ...over.data,
  },
  values: {
    CustomerName: "Sam Lee",
    Email: "sam@example.com",
    Contact: "0400 111 222",
    Pickup: "Footscray",
    Delivery: "Sunshine",
    Services: "Furniture Wrapping",
    Crew: "2 men 1 truck",
    BookingStatus: "Confirmed",
    BookingNo: "BLR15102601",
    StairFlights: "0",
    Hours: 4,
    RateHr: "130.00",
    Labour: "520.00",
    CallOut: "100.00",
    Packing: "0.00",
    Stair: "0.00",
    Subtotal: "620.00",
    GST: "62.00",
    Total: "682.00",
    ...over.values,
  },
});

describe("Matt's Google Form row -> a job", () => {
  it("maps the sheet's own figures, booking number, source and truck", () => {
    const r = parseTeamForm(payload());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job).toMatchObject({
      externalRef: "BLR15102601",
      linkedReference: null,
      customerName: "Sam Lee",
      need: "moving",
      jobDescription: "Residential Moving -- Sofa, bed, 20 boxes",
      movingDate: "2026-10-21",
      arrivalTime: "08:00",
      truck: "4.5T",
      movers: 2,
      status: "booked",
      channel: "airtasker",
      platformJobNumber: "AT-55120",
      lines: { labour: 520, callOut: 100, subtotal: 620, gst: 62, total: 682, adjustment: 0, hours: 4, rateHr: 130 },
    });
    expect(calendarProblem(r.job)).toBeNull();
  });

  it("links to the website/chat request when Matt gives its reference", () => {
    const r = parseTeamForm(payload({ data: { "Website or chat reference": " blr-20261015-abc123 " } }));
    expect(r.ok && r.job.linkedReference).toBe("BLR-20261015-ABC123");
  });

  it("a booked job missing what the calendar needs is flagged, not guessed", () => {
    const r = parseTeamForm(payload({ arrivalTime: null, data: { "Truck size": "" } }));
    expect(r.ok && calendarProblem(r.job)).toBe("Not in the calendar -- Matt's form is missing: arrival time, truck size");
  });

  it("refuses a row without a booking number, customer or total", () => {
    expect(parseTeamForm(payload({ values: { BookingNo: "" } })).ok).toBe(false);
    expect(parseTeamForm(payload({ values: { Email: "" } })).ok).toBe(false);
    expect(parseTeamForm(payload({ values: { Total: "" } })).ok).toBe(false);
  });

  it("reads statuses, sources, trucks and crews the way Matt writes them", () => {
    expect(["Confirmed", "Not Confirmed", "Completed", "Cancelled", "Pending"].map(parseStatus)).toEqual(["booked", "quoted", "completed", "cancelled", "quoted"]);
    expect(["Phone", "Airtasker", "Moval", "Website follow-up", "Referral"].map(parseChannel)).toEqual(["phone", "airtasker", "moval", "website_followup", "other"]);
    expect(["4.5T", "6-8T", "10T", "4.5 tonne", ""].map(parseTruck)).toEqual(["4.5T", "6-8T", "10T", "4.5T", null]);
    expect(["2 men 1 truck", "3 movers", "one truck"].map(parseMovers)).toEqual([2, 3, null]);
  });

  it("records the 10% first-booking discount the script took off, as a minus adjustment line", () => {
    // 520 labour + 100 call-out = 620; 10% off = 62 -> 558 + GST 55.80 = 613.80.
    const r = parseTeamForm(payload({ values: { Discount: "62.00", Adjustment: "-62.00", Subtotal: "558.00", GST: "55.80", Total: "613.80" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.firstBookingDiscount).toBe(62);
    expect(r.job.lines).toMatchObject({ labour: 520, callOut: 100, adjustment: -62, subtotal: 558, gst: 55.8, total: 613.8 });
  });

  it("no discount value means no first-booking discount", () => {
    const r = parseTeamForm(payload({ values: { Discount: "" } }));
    expect(r.ok && r.job.firstBookingDiscount).toBe(null);
    const r2 = parseTeamForm(payload());
    expect(r2.ok && r2.job.firstBookingDiscount).toBe(null);
  });
});
