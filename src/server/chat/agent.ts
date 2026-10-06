import type Anthropic from "@anthropic-ai/sdk";
import { guardReply } from "./guard.js";
import { chatTools, type ToolRecord, type ToolRun } from "./tools.js";

// One customer turn: send the conversation to Claude, run any tools it asks for (proper
// tool_use / tool_result blocks), repeat until it answers in text, then run the reply
// through the price guard. Pure apart from the injected model call and tool runner, so
// it's tested without a network.

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 4;
export const FALLBACK_REPLY = "Sorry, I need a moment -- could you try that again?";

export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export interface StoredTurn {
  role: "user" | "assistant" | "human_agent";
  content: string;
}

export interface AgentTurnResult {
  reply: string;
  toolRecords: ToolRecord[];
  /** Set when the guard replaced the model's reply. */
  blocked: string | null;
}

/** Stored turns -> Anthropic messages: starts with the customer, alternates roles. */
export function toModelMessages(history: StoredTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    const role = turn.role === "user" ? "user" : "assistant";
    const content = turn.role === "human_agent" ? `[Reply from a Blue Line team member]: ${turn.content}` : turn.content;
    if (out.length === 0 && role === "assistant") continue; // the greeting is in the system prompt
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}

export async function runAgentTurn(params: {
  createMessage: CreateMessage;
  model?: string;
  systemPrompt: string;
  history: StoredTurn[];
  runTool: (name: string, input: unknown) => Promise<ToolRun>;
  /** amountAud values already quoted earlier in this conversation. */
  previouslyQuoted: number[];
}): Promise<AgentTurnResult> {
  const messages = toModelMessages(params.history);
  const toolRecords: ToolRecord[] = [];
  let text: string | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await params.createMessage({
      model: params.model ?? DEFAULT_MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: params.systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: chatTools,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const replyText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      text = replyText || null;
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const run = await params.runTool(use.name, use.input);
      toolRecords.push(run.record);
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(run.result), is_error: run.isError });
    }
    messages.push({ role: "user", content: results });
  }

  if (!text) return { reply: FALLBACK_REPLY, toolRecords, blocked: null };

  const quoted = [...params.previouslyQuoted, ...toolRecords.flatMap((r) => (r.quotedAmountAud === undefined ? [] : [r.quotedAmountAud]))];
  const guarded = guardReply(text, quoted);
  return { reply: guarded.text, toolRecords, blocked: guarded.ok ? null : guarded.reason };
}
