import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY, runAgentTurn, toModelMessages, type CreateMessage } from "./agent.js";
import { BLOCKED_REPLY } from "./guard.js";
import type { ToolRun } from "./tools.js";

const msg = (content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"]): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: {} }) as unknown as Anthropic.Message;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.TextBlock;
const toolUse = (name: string, input: unknown, id = "tu_1") => ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;

/** A scripted model: returns the given responses in order and records each request. */
function scripted(...responses: Anthropic.Message[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
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

describe("runAgentTurn", () => {
  it("runs get_quote through proper tool_result blocks and lets the quoted price through", async () => {
    const { createMessage, calls } = scripted(
      msg([text("Let me work that out."), toolUse("get_quote", { name: "Jane" })], "tool_use"),
      msg([text("Your flat price is $850 all up.")], "end_turn"),
    );
    const runTool = vi.fn(async () => priced(850));

    const out = await runAgentTurn({ ...base, createMessage, history, runTool });

    expect(out).toEqual({ reply: "Your flat price is $850 all up.", toolRecords: [priced(850).record], blocked: null });
    expect(runTool).toHaveBeenCalledWith("get_quote", { name: "Jane" });
    const second = calls[1]!.messages;
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: JSON.stringify(priced(850).result), is_error: false }],
    });
    expect(calls[0]!.tools!.map((t) => (t as Anthropic.Tool).name)).toEqual(["get_quote", "request_human_followup"]);
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

  it("uses the configured model and caches the system prompt", async () => {
    const { createMessage, calls } = scripted(msg([text("Hello!")], "end_turn"));
    await runAgentTurn({ ...base, createMessage, history, runTool: vi.fn(), model: "claude-test" });
    expect(calls[0]).toMatchObject({ model: "claude-test", system: [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }] });
  });
});
