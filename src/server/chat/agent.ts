import type Anthropic from "@anthropic-ai/sdk";
import { DEPOSIT_LINK_MARKER } from "../quote/deposit.js";
import { guardReply } from "./guard.js";
import { chatTools, type ToolRecord, type ToolRun } from "./tools.js";

// One customer turn: send the conversation to Claude, run any tools it asks for (proper
// tool_use / tool_result blocks, appended unchanged so the turn stays append-only), repeat
// until it answers in text, then run the reply through the price guard. Pure apart from the
// injected model call and tool runner, so it's tested without a network.

// Claude Sonnet 5.5: the architecture's Sonnet tier, sized for the AUD $150/month budget.
export const DEFAULT_MODEL = "claude-sonnet-5-5";
// Chat is short slot-filling turns; low effort keeps replies quick and cheap. Override with
// ANTHROPIC_EFFORT if tool inputs ever come back wrong.
export const DEFAULT_EFFORT = "low";
const MAX_TOOL_ROUNDS = 4;
// Thinking counts toward max_tokens, so leave room -- only tokens actually generated are billed.
const MAX_TOKENS = 16000;

export const FALLBACK_REPLY = "Sorry, I need a moment -- could you try that again?";
export const DECLINED_REPLY =
  "Sorry, I can't help with that one here. I've asked a member of the Blue Line team to follow up with you.";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type CreateMessage = (params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export interface StoredTurn {
  role: "user" | "assistant" | "human_agent";
  content: string;
  /** What the tools did for this assistant reply (stored with the message). */
  toolCalls?: ToolRecord[] | null;
}

/**
 * Only the text of earlier turns is sent back to the model, so without this it can't see that it
 * really ran get_quote / request_booking, and later turns doubt (or redo, and apologise for) an
 * estimate it already gave. A short private note says what the tools did, never anything secret:
 * no payment link, no rates.
 */
export function toolNote(records: readonly ToolRecord[] | null | undefined): string {
  const parts = (records ?? [])
    .filter((r) => r.quoteReference)
    .map((r) => `${r.name} ran (reference ${r.quoteReference}${r.quotedAmountAud !== undefined ? `, estimate ${r.quotedAmountAud} dollars` : ""}, outcome ${r.outcome})`);
  return parts.length ? `

[Private record for you, never mention it to the customer: ${parts.join("; ")}.]` : "";
}

export interface TurnUsage {
  model: string;
  rounds: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentTurnResult {
  reply: string;
  toolRecords: ToolRecord[];
  /** Set when the guard replaced the model's reply. */
  blocked: string | null;
  /** The model (and any fallback) declined -- the caller should hand the chat to a person. */
  declined: boolean;
  usage: TurnUsage;
}

/** Stored turns -> Anthropic messages: starts with the customer, alternates roles. */
export function toModelMessages(history: StoredTurn[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const out: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  for (const turn of history) {
    const role = turn.role === "user" ? "user" : "assistant";
    const content =
      turn.role === "human_agent" ? `[Reply from a Blue Line team member]: ${turn.content}` : turn.role === "assistant" ? turn.content + toolNote(turn.toolCalls) : turn.content;
    if (out.length === 0 && role === "assistant") continue; // the greeting is in the system prompt
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}

/**
 * The model never types the long Stripe link itself: it writes DEPOSIT_LINK_MARKER and the
 * exact link request_booking returned this turn is put in its place. No link this turn = the
 * customer is pointed to their email instead.
 */
export function withDepositLink(text: string, records: readonly ToolRecord[]): string {
  if (!text.includes(DEPOSIT_LINK_MARKER)) return text;
  const link = [...records].reverse().find((r) => r.paymentLink)?.paymentLink;
  return text.split(DEPOSIT_LINK_MARKER).join(link ?? "(the secure payment link is in the email we sent you)");
}

export async function runAgentTurn(params: {
  createMessage: CreateMessage;
  model?: string;
  effort?: Effort;
  systemPrompt: string;
  history: StoredTurn[];
  runTool: (name: string, input: unknown) => Promise<ToolRun>;
  /** amountAud values already quoted earlier in this conversation. */
  previouslyQuoted: number[];
}): Promise<AgentTurnResult> {
  const model = params.model ?? DEFAULT_MODEL;
  const messages = toModelMessages(params.history);
  const toolRecords: ToolRecord[] = [];
  const usage: TurnUsage = { model, rounds: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let text: string | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await params.createMessage({
      model,
      max_tokens: MAX_TOKENS,
      output_config: { effort: params.effort ?? DEFAULT_EFFORT },
      // If the model declines on safety grounds, the API retries on a suitable fallback
      // model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: params.systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: chatTools,
      messages,
    });

    usage.rounds += 1;
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

    // The whole chain declined: never show a partial reply, hand to a person instead.
    if (response.stop_reason === "refusal") {
      return { reply: DECLINED_REPLY, toolRecords, blocked: null, declined: true, usage };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    const replyText = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      // A reply cut off at the length cap may end mid-sentence; don't show it.
      text = response.stop_reason === "max_tokens" ? null : replyText || null;
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const run = await params.runTool(use.name, use.input);
      toolRecords.push(run.record);
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(run.result), is_error: run.isError });
    }
    // All results for one assistant message go back in a single user message.
    messages.push({ role: "user", content: results });
  }

  if (!text) return { reply: FALLBACK_REPLY, toolRecords, blocked: null, declined: false, usage };

  const quoted = [...params.previouslyQuoted, ...toolRecords.flatMap((r) => (r.quotedAmountAud === undefined ? [] : [r.quotedAmountAud]))];
  // The model's own words are checked first (any link it typed is refused); the booking's
  // payment link -- from our tool, never the model -- is put in afterwards.
  const guarded = guardReply(text, quoted);
  const reply = guarded.ok ? withDepositLink(guarded.text, toolRecords) : guarded.text;
  return { reply, toolRecords, blocked: guarded.ok ? null : guarded.reason, declined: false, usage };
}
