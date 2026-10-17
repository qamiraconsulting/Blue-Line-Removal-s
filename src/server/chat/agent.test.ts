import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { DECLINED_REPLY, FALLBACK_REPLY, runAgentTurn, toModelMessages, type CreateMessage, withDepositLink } from "./agent.js";
import { BLOCKED_REPLY } from "./guard.js";
import type { ToolRun } from "./tools.js";

type Msg = Anthropic.Beta.Messages.BetaMessage;
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 };
const msg = (content: Anthropic.Beta.Messages.BetaContentBlock[], stop: Msg["stop_reason"]): Msg =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage }) as unknown as Msg;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.Messages.BetaTextBlock;
const toolUse = (name: string, input: unknown, id = "tu_1") => ({ type: "tool_use", id, name, input }) as Anthropic.Beta.Messages.BetaToolUseBlock;

/** A scripted model: returns the given responses in order and records each request. */
function scripted(...responses: Msg[]) {
  const calls: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("model called more times than scripted");
    return next;
  };
  return { createMessage, calls };
}

const priced = (amountAud: number): ToolRun => ({
  result: { ok: true, kind: "price", amountAud, reference: "BLR-1" },
  isError: false,
  record: { name: "get_quote", quoteReference: "BLR-1", quotedAmountAud: amountAud, outcome: "priced" },
});

const base = { systemPrompt: "SYS", previouslyQuoted: [] as number[] };
const history = [
  { role: "assistant" as const, content: "Hi! I'm Blue." },
  { role: "user" as const, content: "Quote me, details confirmed." },
];

describe("toModelMessages", () => {
  it("drops the leading greeting, labels team replies and merges same-role turns", () => {
    expect(
      toModelMessages([
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "human_agent", content: "c" },
        { role: "user", content: "d" },
      ]),
    ).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b\n\n[Reply from a Blue Line team member]: c" },
      { role: "user", content: "d" },
    ]);
  });
});

describe("toolNote", () => {
  it("tells the model what its tools really did earlier, without any link or rate", () => {
    const history = toModelMessages([
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: "Your estimate is $720.",
        toolCalls: [
          { name: "get_quote", quoteReference: "BLR-1", quotedAmountAud: 720, outcome: "priced" },
          { name: "request_booking", quoteReference: "BLR-1", paymentLink: "https://checkout.stripe.com/c/pay/secret", outcome: "booking_requested" },
          { name: "request_human_followup", outcome: "flagged" },
        ],
      },
    ]);
    const note = history[1]!.content as string;
    expect(note).toContain("Your estimate is $720.");
    expect(note).toContain("get_quote ran (reference BLR-1, estimate 720 dollars, outcome priced)");
    expect(note).toContain("request_booking ran (reference BLR-1, outcome booking_requested)");
    expect(note).not.toContain("stripe");
    expect(note).not.toContain("request_human_followup");
    expect(toModelMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b", toolCalls: [] }])[1]!.content).toBe("b");
  });
});

describe("runAgentTurn", () => {
  it("runs get_quote through proper tool_result blocks and lets the quoted price through", async () => {
    const { createMessage, calls } = scripted(
      msg([text("Let me work that out."), toolUse("get_quote", { name: "Jane" })], "tool_use"),
      msg([text("Your flat price is $850 all up.")], "end_turn"),
    );
    const runTool = vi.fn(async () => priced(850));

    const out = await runAgentTurn({ ...base, createMessage, history, runTool });

    expect(out).toMatchObject({ reply: "Your flat price is $850 all up.", toolRecords: [priced(850).record], blocked: null, declined: false });
    expect(out.usage).toEqual({ model: "claude-sonnet-5-5", rounds: 2, inputTokens: 200, outputTokens: 40, cacheReadTokens: 160, cacheWriteTokens: 0 });
    expect(runTool).toHaveBeenCalledWith("get_quote", { name: "Jane" });
    const second = calls[1]!.messages;
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: JSON.stringify(priced(850).result), is_error: false }],
    });
    expect(calls[0]!.tools!.map((t) => (t as Anthropic.Beta.Messages.BetaTool).name)).toEqual(["get_quote", "request_personal_quote", "check_availability", "request_booking", "request_human_followup"]);
  });

  it("replaces a reply containing a price the engine didn't produce", async () => {
    const { createMessage } = scripted(msg([text("A 2 bed is usually about $700.")], "end_turn"));
    const out = await runAgentTurn({ ...base, createMessage, history, runTool: vi.fn() });
    expect(out).toMatchObject({ reply: BLOCKED_REPLY, blocked: "unquoted_amount" });
  });

  it("allows repeating a price quoted earlier in the same chat", async () => {
    const { createMessage } = scripted(msg([text("Yes, it's still $850.")], "end_turn"));
    const out = await runAgentTurn({ ...base, previouslyQuoted: [850], createMessage, history, runTool: vi.fn() });
    expect(out.blocked).toBeNull();
  });

  it("stops after a few tool rounds instead of looping forever", async () => {
    const loop = () => msg([toolUse("request_human_followup", { reason: "x" })], "tool_use");
    const { createMessage, calls } = scripted(loop(), loop(), loop(), loop(), loop());
    const runTool = vi.fn(async (): Promise<ToolRun> => ({ result: { ok: true }, isError: false, record: { name: "request_human_followup", outcome: "x" } }));
    const out = await runAgentTurn({ ...base, createMessage, history, runTool });
    expect(out.reply).toBe(FALLBACK_REPLY);
    expect(calls).toHaveLength(4);
  });

  it("uses the configured model, low effort by default, server-side fallback, and caches the system prompt", async () => {
    const { createMessage, calls } = scripted(msg([text("Hello!")], "end_turn"));
    await runAgentTurn({ ...base, createMessage, history, runTool: vi.fn(), model: "claude-test" });
    expect(calls[0]).toMatchObject({
      model: "claude-test",
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }],
    });
    expect(calls[0]!.max_tokens).toBeGreaterThanOrEqual(8000); // thinking counts toward the cap
  });

  it("if the model (and its fallback) declines, nothing partial is shown and the chat is handed over", async () => {
    const { createMessage } = scripted(msg([text("partial")], "refusal"));
    const out = await runAgentTurn({ ...base, createMessage, history, runTool: vi.fn() });
    expect(out).toMatchObject({ reply: DECLINED_REPLY, declined: true });
  });

  it("a reply cut off at the length cap is not shown", async () => {
    const { createMessage } = scripted(msg([text("Your estimate is")], "max_tokens"));
    const out = await runAgentTurn({ ...base, createMessage, history, runTool: vi.fn() });
    expect(out.reply).toBe(FALLBACK_REPLY);
  });
});

describe("deposit link", () => {
  const link = "https://checkout.stripe.com/c/pay/cs_test_a1#fidkdWxOYHwnPyd1blpxYHZxWjA0";
  it("puts the exact link request_booking returned where the model wrote the marker", () => {
    expect(withDepositLink("Pay here:\n[[deposit_link]]\nIt works for 24 hours.", [{ name: "request_booking", paymentLink: link, outcome: "booking_requested" }])).toBe(`Pay here:\n${link}\nIt works for 24 hours.`);
  });
  it("with no link this turn, points the customer to their email; leaves other replies alone", () => {
    expect(withDepositLink("Pay here: [[deposit_link]]", [])).toBe("Pay here: (the secure payment link is in the email we sent you)");
    expect(withDepositLink("No link here.", [{ name: "request_booking", paymentLink: link, outcome: "x" }])).toBe("No link here.");
  });
});
