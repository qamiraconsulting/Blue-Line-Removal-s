import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Runs the Apps Script code that Ayesha pastes into Code.gs
// (docs/apps-script/blr-first-booking-offer.gs) with stand-ins for Google's services, so the
// 10% first-booking offer's sums and decisions are checked here too.

const code = readFileSync(new URL("../../../docs/apps-script/blr-first-booking-offer.gs", import.meta.url), "utf8");

interface Fakes {
  check?: { status: number; body: unknown } | "throw";
  noticeTo?: string;
}

function load(fakes: Fakes = {}) {
  const fetched: { url: string; payload: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const logRows: unknown[][] = [];
  const emails: { to: string; subject: string; body: string }[] = [];
  const props: Record<string, string> = { BLR_INTAKE_URL: "https://site/api/intake", BLR_SHARED_SECRET: "s3cret", ...(fakes.noticeTo ? { BLR_OFFER_NOTICE_TO: fakes.noticeTo } : {}) };
  const sheet = { appendRow: (r: unknown[]) => logRows.push(r), getRange: () => ({ setFontWeight: () => {} }), setFrozenRows: () => {} };
  const ctx: Record<string, unknown> = {
    CONFIG: { SEND_FROM: "hello@bluelineremovals.com.au" },
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    UrlFetchApp: {
      fetch: (url: string, o: { payload: string; headers: Record<string, string> }) => {
        fetched.push({ url, payload: JSON.parse(o.payload), headers: o.headers });
        if (fakes.check === "throw") throw new Error("DNS error");
        const c = fakes.check ?? { status: 200, body: { ok: true, customerType: "new", previousMove: null, discountPercent: 10 } };
        return { getResponseCode: () => c.status, getContentText: () => JSON.stringify(c.body) };
      },
    },
    Utilities: { formatDate: (d: Date) => d.toISOString().slice(0, 10) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => sheet }) },
    GmailApp: { sendEmail: (to: string, subject: string, body: string) => emails.push({ to, subject, body }) },
    // Code.gs's own loose header lookup.
    getVal_: (row: Record<string, unknown>, needle: string) => {
      const key = Object.keys(row).find((k) => k.toLowerCase().includes(needle.toLowerCase()));
      return key === undefined ? "" : row[key];
    },
  };
  runInNewContext(code, ctx);
  // A Date made inside the script's own context, so its `instanceof Date` checks see a date.
  const moveDate = runInNewContext("new Date('2026-11-02T00:00:00Z')", ctx) as Date;
  return { ctx: ctx as Record<string, (...a: unknown[]) => unknown>, fetched, logRows, emails, moveDate };
}

// A quote like the plan's example: 390 labour + 100 call-out + 0 packing + 40 stairs.
const values = () => ({
  CustomerName: "Jane Smith",
  Email: "jane@example.com",
  Contact: 412345678, // Sheets drops the leading 0
  BookingNo: "BLR25102616",
  Labour: "390.00",
  CallOut: "100.00",
  Packing: "0.00",
  Stair: "40.00",
  Subtotal: "530.00",
  GST: "53.00",
  Total: "583.00",
});
const row = (over: Record<string, unknown> = {}) => ({ "Customer Name": "Jane Smith", Source: "Phone", "Website or chat reference": "", ...over });

describe("Apps Script: 10% first-booking offer on Matt's quotes", () => {
  it("new customer: 10% off the subtotal, GST on the lower amount, PDF line + email line", () => {
    const { ctx, fetched, logRows, moveDate } = load();
    const v = values();
    ctx.applyFirstBookingOffer_(row(), v, moveDate, "Australia/Melbourne");
    expect(v).toMatchObject({
      Discount: "53.00",
      Adjustment: "-53.00",
      AdjustmentLabel: "New customer discount (10%)",
      Subtotal: "477.00",
      GST: "47.70",
      Total: "524.70",
    });
    expect(fetched[0].payload).toEqual({
      action: "customerCheck",
      email: "jane@example.com",
      phone: "412345678",
      bookingNo: "BLR25102616",
      linkedReference: "",
      moveDateIso: "2026-11-02",
    });
    expect(fetched[0].headers["x-blr-secret"]).toBe("s3cret");
    expect(logRows[0]).toEqual(["Logged at", "Booking No", "Customer", "Email", "Phone", "Source", "Matt's choice", "Customer type", "Previous move", "Discount (AUD)", "Total before (AUD)", "Total after (AUD)", "Note"]);
    expect(logRows[1].slice(1)).toEqual(["BLR25102616", "Jane Smith", "jane@example.com", "412345678", "Phone", "Automatic", "New", "", 53, 583, 524.7, "First booking with Blue Line"]);
    expect(ctx.offerEmailOpts_(v)).toEqual({
      introText: "Welcome to Blue Line Removals! As a first-time customer, 10% (A$53.00) has been taken off your estimate.",
      introHtml: "Welcome to Blue Line Removals! As a first-time customer, <strong>10% (A$53.00)</strong> has been taken off your estimate.",
    });
  });

  it("returning customer: no discount, the tab says which move", () => {
    const { ctx, logRows, moveDate } = load({
      check: { status: 200, body: { ok: true, customerType: "returning", previousMove: { reference: "BLR16102614", movingDate: "2026-10-19", status: "completed" }, discountPercent: 10 } },
    });
    const v = values();
    ctx.applyFirstBookingOffer_(row(), v, moveDate, "Australia/Melbourne");
    expect(v).toEqual(values());
    expect(logRows[1].slice(7)).toEqual(["Returning", "BLR16102614 on 19 Oct 2026", 0, 583, 583, "Moved with us before -- no discount"]);
    expect(ctx.offerEmailOpts_(v)).toBeUndefined();
  });

  it("Airtasker / Moval jobs keep the platform price; Matt's choice beats everything", () => {
    const { ctx, moveDate } = load();
    const airtasker = values();
    ctx.applyFirstBookingOffer_(row({ Source: "Airtasker" }), airtasker, moveDate, "Australia/Melbourne");
    expect(airtasker.Total).toBe("583.00");

    const given = values();
    ctx.applyFirstBookingOffer_(row({ Source: "Moval", "First-booking offer": "Give 10%" }), given, moveDate, "Australia/Melbourne");
    expect(given.Total).toBe("524.70");

    const refused = values();
    ctx.applyFirstBookingOffer_(row({ "First-booking offer": "No discount" }), refused, moveDate, "Australia/Melbourne");
    expect(refused.Total).toBe("583.00");
  });

  it("website unreachable or erroring: the 10% is given and marked Not checked", () => {
    for (const check of ["throw", { status: 502, body: { ok: false } }] as const) {
      const { ctx, logRows, moveDate } = load({ check });
      const v = values();
      ctx.applyFirstBookingOffer_(row(), v, moveDate, "Australia/Melbourne");
      expect(v.Total).toBe("524.70");
      expect(logRows[1][7]).toBe("Not checked");
      expect(String(logRows[1][12])).toMatch(/please check/);
    }
  });

  it("optional note to Matt only when BLR_OFFER_NOTICE_TO is set, with the final-bill reminder", () => {
    expect(load().emails).toEqual([]);
    const { ctx, emails, moveDate } = load({ noticeTo: "matt@example.com" });
    ctx.applyFirstBookingOffer_(row(), values(), moveDate, "Australia/Melbourne");
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Quote BLR25102616 -- Jane Smith: NEW customer, 10% (A$53.00) taken off");
    expect(emails[0].body).toMatch(/take the same 10% off the final bill/);
  });

  it("resend (quiet) re-applies the discount without a second tab line or note", () => {
    const { ctx, logRows, emails, moveDate } = load({ noticeTo: "matt@example.com" });
    const v = values();
    ctx.applyFirstBookingOffer_(row(), v, moveDate, "Australia/Melbourne", { quiet: true });
    expect(v.Total).toBe("524.70");
    expect(logRows).toEqual([]);
    expect(emails).toEqual([]);
  });

  it("sums stay right with odd amounts, and the PDF amount gets a minus sign", () => {
    const { ctx } = load();
    expect(ctx.discountedFigures_("361.50", "36.15", 10)).toEqual({ discount: "36.15", subtotal: "325.35", gst: "32.54", total: "357.89" });
    expect(ctx.discountedFigures_("0.00", "0.00", 10)).toEqual({ discount: "0.00", subtotal: "0.00", gst: "0.00", total: "0.00" });
    expect(ctx.adjustmentAmountText_("$0.00", "0.00", "-53.00")).toBe("−$53.00");
    expect(ctx.adjustmentAmountText_("$ 12.00", "12.00", "24.55")).toBe("$ 24.55");
    expect(ctx.adjustmentAmountText_("", "0.00", "-5")).toBe("−5.00");
  });
});
