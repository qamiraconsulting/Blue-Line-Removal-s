import { describe, expect, it, vi } from "vitest";
import { fixtureRateCard } from "../quote/rateCard.fixture.js";
import type { OutgoingEmail, QuoteServiceDeps } from "../quote/service.js";
import type { NewQuoteRow, QuoteStore } from "../quote/store.js";
import type { LeadPatch, LeadStore } from "./leadStore.js";
import { ESTIMATE_DISCLAIMER, RISKY_ITEMS_NOTE } from "../quote/emails.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { chatTools, createToolRunner } from "./tools.js";

// Same hand-checked numbers as the form's tests: 6t truck + 2 movers on a weekday, 20 km / 30 min legs = $720.
const routeFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ routes: [{ distanceMeters: 20000, duration: "1800s" }] }),
})) as unknown as typeof fetch;

function setup(quoteDepsOverride?: Partial<QuoteServiceDeps> | null) {
  const rows: NewQuoteRow[] = [];
  const sent: OutgoingEmail[] = [];
  const leadCalls: Array<[string, LeadPatch]> = [];
  const store: QuoteStore = {
    isReturningCustomer: async () => true, // standard price in these tests
    recentQuoteCount: async () => 0,
    saveQuote: async (row) => void rows.push(row),
    markCustomerEmailSent: async () => {},
  };
  const quoteDeps: QuoteServiceDeps | null =
    quoteDepsOverride === null
      ? null
      : {
          rateCard: fixtureRateCard,
          allowPlaceholderRateCard: false,
          routes: { apiKey: "k", fetchImpl: routeFetch },
          store,
          sendEmail: async (e) => (sent.push(e), true),
          teamEmail: "team@example.com",
          customerReplyTo: "hello@example.com",
          now: () => new Date("2026-10-06T02:00:00Z"),
          makeReference: () => "BLR-CHAT-1",
          log: () => {},
          ...quoteDepsOverride,
        };
  let flagged = false;
  const leads: LeadStore = {
    upsertForConversation: async (id, patch) => {
      leadCalls.push([id, patch]);
      const wasFlagged = flagged;
      if (patch.humanFollowupRequired) flagged = true;
      return { wasFlagged };
    },
  };
  const runTool = createToolRunner({ quoteDeps, leads, conversationId: "conv-1", log: () => {} });
  return { runTool, rows, sent, leadCalls, quoteDeps };
}

const quoteInput = {
  name: "Jane Smith",
  phone: "0412 345 678",
  email: "jane@example.com",
  need: "moving",
  from: "12 Station St, Preston VIC 3072",
  to: "5 High St, Brunswick VIC 3056",
  date: "2026-10-14",
  propertySize: "2_bed",
  moveType: "home",
  pickupStairFlights: 0,
  dropoffStairFlights: 0,
  pickupApartment: false,
  dropoffApartment: false,
  pickupParkingOver50m: false,
  dropoffParkingOver50m: false,
  specialItems: false,
  accessNotes: "",
};

describe("get_quote uses the same engine and flow as the website form", () => {
  it("prices the job identically to the form, records it as a chat quote, and emails the customer", async () => {
    const { runTool, rows, sent, leadCalls } = setup();
    const run = await runTool("get_quote", quoteInput);

    expect(run.result).toMatchObject({ ok: true, kind: "price", amountAud: 720, reference: "BLR-CHAT-1", emailed: true });
    expect(run.record).toEqual({ name: "get_quote", quoteReference: "BLR-CHAT-1", quotedAmountAud: 720, outcome: "priced" });
    expect(rows[0]).toMatchObject({ source: "chatbot", conversationId: "conv-1", propertySize: "2_bed", truck: null, movers: null, amountAud: 720 });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Via: website chat");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Truck & crew: 6-8 tonne truck, 2 movers");
    expect(leadCalls[0]).toEqual(["conv-1", expect.objectContaining({ customerName: "Jane Smith", quoteReference: "BLR-CHAT-1" })]);
    expect(leadCalls[0]![1].humanFollowupRequired).toBeUndefined();
  });

  it("prices the crew size the customer chose, and passes their access notes to the team", async () => {
    const { runTool, sent } = setup();
    const run = await runTool("get_quote", { ...quoteInput, movers: 4, accessNotes: "2 flights of stairs at pickup" });
    expect(run.result).toMatchObject({ amountAud: 1510 }); // same as the form for a 2 bed with 4 movers
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Access notes: 2 flights of stairs at pickup");
  });

  it("asks again instead of passing on an incomplete address", async () => {
    const { runTool, rows } = setup();
    const noStreet = await runTool("get_quote", { ...quoteInput, from: "Preston" });
    expect(noStreet.result).toMatchObject({ ok: false });
    expect(JSON.stringify(noStreet.result)).toContain("full pickup address");
    expect(noStreet.record.outcome).toBe("address_incomplete");
    const noPostcode = await runTool("get_quote", { ...quoteInput, from: "12 Station St, Preston" });
    expect(noPostcode.record.outcome).toBe("address_incomplete");
    const noDropoff = await runTool("get_quote", { ...quoteInput, to: "Brunswick" });
    expect(JSON.stringify(noDropoff.result)).toContain("full drop-off address");
    expect(rows).toHaveLength(0); // nothing was quoted

    // a drop-off with only the suburb and postcode is accepted (the street may not be known yet)
    const suburbOnly = await runTool("get_quote", { ...quoteInput, to: "Brunswick VIC 3056" });
    expect(suburbOnly.result).toMatchObject({ ok: true, kind: "price" });
  });

  it("an on-the-day inspection request still gets an estimate", async () => {
    const { runTool } = setup();
    const run = await runTool("get_quote", { ...quoteInput, truck: "inspect" });
    expect(run.result).toMatchObject({ ok: true, kind: "price", amountAud: 720 });
  });

  it("never hands the model the internal breakdown, rates or call-out", async () => {
    const { runTool } = setup();
    const shown = JSON.stringify((await runTool("get_quote", quoteInput)).result);
    expect(shown).not.toMatch(/hour|call-?out|crewRate|subtotal|breakdown|rateCard/i);
  });

  it("a job that needs a person flags the chat for the dashboard", async () => {
    const { runTool, leadCalls } = setup();
    const run = await runTool("get_quote", { ...quoteInput, specialItems: true });
    expect(run.result).toMatchObject({ ok: true, kind: "manual", reference: "BLR-CHAT-1" });
    expect(run.record.quotedAmountAud).toBeUndefined();
    expect(leadCalls[0]![1]).toMatchObject({ humanFollowupRequired: true });
  });

  it("passes validation problems back so the assistant can ask again", async () => {
    const { runTool } = setup();
    expect((await runTool("get_quote", { ...quoteInput, email: "not-an-email" })).result).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
    const missing = await runTool("get_quote", { name: "Jane" });
    expect(missing).toMatchObject({ isError: true, record: { outcome: "invalid_input" } });
  });

  it("with no quote service configured, says so and flags a person instead of guessing", async () => {
    const { runTool, leadCalls } = setup(null);
    const run = await runTool("get_quote", quoteInput);
    expect(run.result).toMatchObject({ ok: false });
    expect(JSON.stringify(run.result)).not.toMatch(/\$\d/);
    expect(leadCalls[0]![1]).toMatchObject({ humanFollowupRequired: true });
  });

  it("a broken lead store never breaks the customer's chat", async () => {
    const failing = createToolRunner({
      quoteDeps: null,
      leads: { upsertForConversation: async () => Promise.reject(new Error("db down")) },
      conversationId: "c",
      log: () => {},
    });
    await expect(failing("request_human_followup", { reason: "x" })).resolves.toMatchObject({ result: { ok: true } });
    await expect(failing("get_quote", quoteInput)).resolves.toMatchObject({ result: { ok: false } });
  });
});

describe("request_personal_quote", () => {
  const job = {
    name: "Sam Lee",
    phone: "0400 111 222",
    email: "sam@example.com",
    need: "moving",
    description: "3-4 boxes, must arrive before 3pm",
    from: "Chirnside Park",
    to: "Milawa",
    date: "2026-10-15",
    reason: "small_load",
  };

  it("sends the job to the team with only the details it needs -- no home size, truck or access questions", async () => {
    const { runTool, rows, sent, leadCalls } = setup();
    const run = await runTool("request_personal_quote", job);
    expect(run.result).toEqual({ ok: true, kind: "personal_quote", reference: "BLR-CHAT-1", emailed: true });
    expect(run.record).toEqual({ name: "request_personal_quote", quoteReference: "BLR-CHAT-1", outcome: "personal_quote" });
    expect(rows[0]).toMatchObject({ source: "chatbot", manualReason: "small_load", jobDescription: "3-4 boxes, must arrive before 3pm", propertySize: null });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("3-4 boxes, must arrive before 3pm");
    expect(leadCalls.at(-1)![1]).toMatchObject({ humanFollowupRequired: true, quoteReference: "BLR-CHAT-1" });
  });

  it("rejects a request without a description or reason", async () => {
    const { runTool } = setup();
    const { description: _d, ...noDescription } = job;
    expect(await runTool("request_personal_quote", noDescription)).toMatchObject({ isError: true });
    expect(await runTool("request_personal_quote", { ...job, reason: "because" })).toMatchObject({ isError: true });
  });
});

describe("request_booking", () => {
  it("refuses unless the customer clearly agreed to the booking terms", async () => {
    const { runTool } = setup();
    const run = await runTool("request_booking", { quoteReference: "BLR-CHAT-1", agreedToTerms: false });
    expect(run).toMatchObject({ isError: true, record: { outcome: "invalid_input" } });
  });

  it("books the estimate made earlier in the same chat and flags it for the team", async () => {
    const { quoteDeps, leadCalls, sent } = setup();
    // a real quote first, so the booking store has something to find
    const rows: Record<string, unknown>[] = [];
    const quoteRunner = createToolRunner({
      quoteDeps: { ...quoteDeps!, store: { ...quoteDeps!.store!, saveQuote: async (row) => void rows.push(row) } },
      leads: { upsertForConversation: async (id, patch) => (leadCalls.push([id, patch]), { wasFlagged: false }) },
      conversationId: "conv-1",
      log: () => {},
    });
    await quoteRunner("get_quote", quoteInput);
    const stored = { ...rows[0], bookingStatus: null, bookingNotes: null } as never;
    let marked = false;
    const runTool = createToolRunner({
      quoteDeps,
      leads: { upsertForConversation: async (id, patch) => (leadCalls.push([id, patch]), { wasFlagged: false }) },
      bookings: {
        findQuote: async () => stored,
        markRequested: async () => ((marked = true), true),
        loadCapacity: async () => ({
          settings: { autoConfirm: false, workingDays: [], arrivalTimes: [], dayEndTime: null, bufferMinutes: null, moversPerDay: null, minNoticeHours: null, maxDaysAhead: null, autoConfirmMaxAud: null },
          trucks: [],
          override: null,
          bookings: [],
        }),
        confirm: async () => null,
      },
      conversationId: "conv-1",
      log: () => {},
    });
    sent.length = 0;
    const run = await runTool("request_booking", { quoteReference: "BLR-CHAT-1", agreedToTerms: true, notes: "8am start" });
    expect(run.result).toMatchObject({ ok: true, status: "requested", reference: "BLR-CHAT-1" });
    expect(run.record.outcome).toBe("booking_requested");
    expect(marked).toBe(true);
    expect(leadCalls.at(-1)![1]).toMatchObject({ humanFollowupRequired: true, quoteReference: "BLR-CHAT-1" });
    expect(sent.map((e) => e.kind).sort()).toEqual(["customer", "team"]);
  });

  it("with no booking store configured, asks the team to call instead", async () => {
    const { runTool, leadCalls } = setup();
    const run = await runTool("request_booking", { quoteReference: "BLR-CHAT-1", agreedToTerms: true });
    expect(run.result).toMatchObject({ ok: false });
    expect(leadCalls.at(-1)![1]).toMatchObject({ humanFollowupRequired: true });
  });
});

describe("request_human_followup", () => {
  it("a call-back request always alerts the team, with the time asked for", async () => {
    const { runTool, sent, leadCalls } = setup();
    await runTool("request_human_followup", { reason: "didn't agree to the booking terms" });
    await runTool("request_human_followup", { reason: "wants to talk it through", callbackRequested: true, callbackTime: "tomorrow after 3pm", phone: "0412345678" });
    const alerts = sent.filter((e) => e.kind === "team");
    expect(alerts).toHaveLength(2);
    expect(alerts[1]!.subject).toContain("Call back requested");
    expect(alerts[1]!.text).toContain("tomorrow after 3pm");
    expect(leadCalls.at(-1)![1].notes).toContain("CALL BACK tomorrow after 3pm");
  });

  it("emails the team once when a chat is handed over, with a link to the conversation", async () => {
    const { runTool, sent } = setup();
    await runTool("request_human_followup", { reason: "asked for a person", name: "Jane", phone: "0412345678" });
    await runTool("request_human_followup", { reason: "still waiting" });
    const alerts = sent.filter((e) => e.subject.startsWith("Chat needs a person"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ to: "team@example.com", kind: "team" });
    expect(alerts[0]!.text).toContain("/admin/conversations/conv-1");
    expect(alerts[0]!.text).toContain("Phone: 0412345678");
  });

  it("still emails the team if the dashboard store is down (the email is then the only record)", async () => {
    const { quoteDeps, sent } = setup();
    const runTool = createToolRunner({
      quoteDeps,
      leads: { upsertForConversation: async () => Promise.reject(new Error("db down")) },
      conversationId: "c",
      log: () => {},
    });
    await runTool("request_human_followup", { reason: "x" });
    expect(sent).toHaveLength(1);
  });

  it("flags the conversation with the reason and any contact details", async () => {
    const { runTool, leadCalls } = setup();
    await runTool("request_human_followup", { reason: "packing", name: "Jane", phone: "0412345678" });
    expect(leadCalls[0]).toEqual(["conv-1", expect.objectContaining({ humanFollowupRequired: true, notes: "packing", customerName: "Jane", phone: "0412345678" })]);
  });
});

describe("tool and prompt wording", () => {
  it("offers exactly five tools", () => {
    expect(chatTools.map((t) => t.name)).toEqual(["get_quote", "request_personal_quote", "check_availability", "request_booking", "request_human_followup"]);
  });

  it("the prompt states today's Melbourne date and the flat-price rules, and quotes no figure but the deposit", () => {
    const prompt = buildSystemPrompt(new Date("2026-10-06T15:30:00Z"), fixtureRateCard); // already 7 Oct in Melbourne
    expect(prompt).toContain("2026-10-07");
    expect(prompt).toContain("Always call it an estimate");
    // the move type comes first, from buttons, and each type gets only its own questions
    expect(prompt).toContain("FIRST, THE MOVE TYPE");
    expect(prompt).toContain("Home, Apartment, Office, Storage, Warehouse, Junk Removal, Other");
    expect(prompt).toContain("[[choices:");
    expect(prompt).toContain("Never ask for something the customer has already told you");
    expect(prompt).toContain(ESTIMATE_DISCLAIMER);
    // the first-customer discount is worked out, never asked
    expect(prompt).toContain("Never ask whether this is their first move with us");
    expect(prompt).toContain("10% first-move discount has been applied");
    // Blue Line's long-carry rule (25 Oct 2026): always at an apartment end, and over 50 m for a house
    expect(prompt).toContain("a long-carry charge ALWAYS applies at that end");
    expect(prompt).toContain("within 50 metres of the door");
    expect(prompt).toContain("The only extra charges for an apartment are stairs with no lift and that long carry");
    expect(prompt).not.toContain("extra apartment charges may apply");
    expect(prompt).not.toMatch(/100 m(etres)?\b(?!.*kg)/); // the old 100 m rule is gone
    // unsure about parking: not priced, customer told, team told
    expect(prompt).toContain("[[choices: Within 50 m | More than 50 m | Not sure]]");
    expect(prompt).toContain("parking distance not known");
    expect(prompt).toContain("never when they're unsure");
    expect(prompt).toContain("pickupApartment / dropoffApartment");
    // the risky-item note and free furniture wrapping
    expect(prompt).toContain(RISKY_ITEMS_NOTE);
    expect(prompt).toContain("Wrapping furniture (bubble wrap, shrink wrap and blankets to cover it) is free");
    // the deposit, and paying the rest
    expect(prompt).toContain("To lock in your booking we take a $100 deposit before the move.");
    expect(prompt).toContain("card, bank transfer or cash");
    // one Stripe link for the deposit (card or bank via PayTo) -- no bank details, no card/bank buttons
    expect(prompt).toContain("do NOT show the link yet");
    expect(prompt).toContain("[[choices: Card | Bank transfer]]");
    expect(prompt).toContain("choose to pay straight from their bank account");
    // full street addresses for the driver
    expect(prompt).toContain("unit or house number, street name, suburb, state and postcode");
    expect(prompt).toContain("4/12 Station St, Preston VIC 3072");
    expect(prompt).toContain("the pickup always needs the full address");
    // the remaining payment wording
    expect(prompt).toContain("The remaining payment can be made by card, bank transfer or cash on the day of the move.");
    expect(prompt).toContain("never give out bank account details");
    expect(prompt).not.toContain("Card (secure link)");
    expect(prompt).toContain("4.5 tonne truck, 6-8 tonne truck, 10 tonne truck");
    expect([...prompt.matchAll(/\$(\d+)/g)].every((m) => m[1] === "100")).toBe(true);
  });
});
