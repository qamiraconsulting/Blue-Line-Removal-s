import { describe, expect, it, vi } from "vitest";
import { fixtureRateCard } from "../quote/rateCard.fixture.js";
import type { OutgoingEmail, QuoteServiceDeps } from "../quote/service.js";
import type { NewQuoteRow, QuoteStore } from "../quote/store.js";
import type { LeadPatch, LeadStore } from "./leadStore.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { chatTools, createToolRunner } from "./tools.js";

// Same hand-checked numbers as the form's tests: 2 bed weekday, 20 km / 30 min legs = $780.
const routeFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ routes: [{ distanceMeters: 20000, duration: "1800s" }] }),
})) as unknown as typeof fetch;

function setup(quoteDepsOverride?: Partial<QuoteServiceDeps> | null) {
  const rows: NewQuoteRow[] = [];
  const sent: OutgoingEmail[] = [];
  const leadCalls: Array<[string, LeadPatch]> = [];
  const store: QuoteStore = {
    hasDiscountedQuote: async () => false,
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
  const leads: LeadStore = { upsertForConversation: async (id, patch) => void leadCalls.push([id, patch]) };
  const runTool = createToolRunner({ quoteDeps, leads, conversationId: "conv-1", log: () => {} });
  return { runTool, rows, sent, leadCalls };
}

const quoteInput = {
  name: "Jane Smith",
  phone: "0412 345 678",
  email: "jane@example.com",
  need: "moving",
  from: "Preston",
  to: "Brunswick",
  date: "2026-10-14",
  propertySize: "2_bed",
  firstMove: false,
  specialItems: false,
  access: { pickupStairFlights: 0, dropoffStairFlights: 0, longCarry: false, heavyItems: 0 },
};

describe("get_quote uses the same engine and flow as the website form", () => {
  it("prices the job identically to the form, records it as a chat quote, and emails the customer", async () => {
    const { runTool, rows, sent, leadCalls } = setup();
    const run = await runTool("get_quote", quoteInput);

    expect(run.result).toMatchObject({ ok: true, kind: "price", amountAud: 780, reference: "BLR-CHAT-1", emailed: true });
    expect(run.record).toEqual({ name: "get_quote", quoteReference: "BLR-CHAT-1", quotedAmountAud: 780, outcome: "priced" });
    expect(rows[0]).toMatchObject({ source: "chatbot", conversationId: "conv-1", propertySize: "2_bed", amountAud: 780 });
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Via: website chat");
    expect(sent.find((e) => e.kind === "team")!.text).toContain("Property size: 2 Bedroom");
    expect(leadCalls[0]).toEqual(["conv-1", expect.objectContaining({ customerName: "Jane Smith", quoteReference: "BLR-CHAT-1" })]);
    expect(leadCalls[0]![1].humanFollowupRequired).toBeUndefined();
  });

  it("prices stairs into the one flat price", async () => {
    const { runTool } = setup();
    // (712.5 + 2 x 40) x 1.1 = 871.75 -> $870
    const run = await runTool("get_quote", { ...quoteInput, access: { ...quoteInput.access, pickupStairFlights: 2 } });
    expect(run.result).toMatchObject({ amountAud: 870 });
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

describe("request_human_followup", () => {
  it("flags the conversation with the reason and any contact details", async () => {
    const { runTool, leadCalls } = setup();
    await runTool("request_human_followup", { reason: "packing", name: "Jane", phone: "0412345678" });
    expect(leadCalls[0]).toEqual(["conv-1", expect.objectContaining({ humanFollowupRequired: true, notes: "packing", customerName: "Jane", phone: "0412345678" })]);
  });
});

describe("tool and prompt wording", () => {
  it("offers exactly the two tools", () => {
    expect(chatTools.map((t) => t.name)).toEqual(["get_quote", "request_human_followup"]);
  });

  it("the prompt states today's Melbourne date and the flat-price rules, and quotes no dollar figures itself", () => {
    const prompt = buildSystemPrompt(new Date("2026-10-06T15:30:00Z")); // already 7 Oct in Melbourne
    expect(prompt).toContain("2026-10-07");
    expect(prompt).toContain("one flat price");
    expect(prompt).toContain("30% off");
    expect(prompt).not.toMatch(/\$\d/);
  });
});
