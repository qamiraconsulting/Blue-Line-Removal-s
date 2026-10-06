import { describe, expect, it } from "vitest";
import { formatAud, formatDateLabel, renderAcknowledgementEmail, renderCustomerQuoteEmail, renderTeamEmail } from "./emails.js";

const details = { from: "Preston", to: "Brunswick", dateLabel: "Wednesday 14 October 2026", propertySize: "2 Bedroom" };

describe("customer quote email", () => {
  const email = renderCustomerQuoteEmail({
    name: "Jane Smith",
    reference: "BLR-20261006-ABC123",
    amountAud: 1240,
    includes: ["2 movers and a 6-8T truck", "GST included"],
    firstMoveApplied: true,
    validUntilLabel: "Tuesday 20 October 2026",
    details,
  });

  it("leads with one price and the reference", () => {
    expect(email.subject).toBe("Your Blue Line Removals quote: $1,240 (ref BLR-20261006-ABC123)");
    expect(email.text).toContain("$1,240 (GST included)");
    expect(email.text).toContain("30% first-move offer");
    expect(email.html).toContain("$1,240");
  });

  it("states the price is final, how to book, and when it expires", () => {
    expect(email.text).toContain("final price");
    expect(email.text).toContain("03 9494 1070");
    expect(email.text).toContain("Valid until: Tuesday 20 October 2026");
  });

  it("contains no hourly rate or call-out wording", () => {
    expect(`${email.text} ${email.html}`).not.toMatch(/\/hr|per hour|hourly|call-?out/i);
  });

  it("omits the offer line when it wasn't applied", () => {
    const plain = renderCustomerQuoteEmail({
      name: "Jane",
      reference: "R",
      amountAud: 900,
      includes: [],
      firstMoveApplied: false,
      validUntilLabel: "x",
      details,
    });
    expect(plain.text).not.toContain("first-move");
  });

  it("escapes anything the customer typed before it goes into HTML", () => {
    const hostile = renderCustomerQuoteEmail({
      name: "<script>alert(1)</script>",
      reference: "R",
      amountAud: 900,
      includes: ["<b>x</b>"],
      firstMoveApplied: false,
      validUntilLabel: "x",
      details: { ...details, from: `"><img src=x onerror=alert(1)>` },
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).not.toContain("<img");
    expect(hostile.html).not.toContain("<b>x</b>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });
});

describe("acknowledgement and team emails", () => {
  it("acknowledgement promises a follow-up and gives no price", () => {
    const ack = renderAcknowledgementEmail({ name: "Jane Smith", reference: "R1" });
    expect(ack.text).toContain("send your exact price shortly");
    expect(ack.text).not.toMatch(/\$\d/);
  });

  it("team email carries everything needed to follow up, plus the breakdown when priced", () => {
    const team = renderTeamEmail({
      reference: "R1",
      name: "Jane Smith",
      phone: "0412 345 678",
      email: "jane@example.com",
      need: "moving",
      details,
      firstMoveRequested: true,
      firstMoveApplied: false,
      outcomeLine: "PRICED $780",
      internalBreakdown: { crewRateAudPerHour: 145 },
    });
    expect(team.text).toContain("requested, NOT applied");
    expect(team.text).toContain("crewRateAudPerHour");
    expect(team.subject).toContain("Jane Smith");
  });
});

describe("formatting", () => {
  it("formats prices and dates the Australian way", () => {
    expect(formatAud(1240)).toBe("$1,240");
    expect(formatDateLabel("2026-10-14")).toContain("14 October 2026");
    expect(formatDateLabel("2026-10-14")).toContain("Wednesday");
    expect(formatDateLabel(null)).toBe("");
  });
});
