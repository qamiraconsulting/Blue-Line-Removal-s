import Anthropic from "@anthropic-ai/sdk";
import type { ConversationMessage, LLMProvider, LLMTurnResult, ToolDefinition } from "./LLMProvider.js";

// Default model per the roadmap's confirmed cost basis: standard $3/$15
// per-million-token pricing (the $2/$10 introductory rate expired
// 2026-08-31, before this build could realistically ship -- see the
// roadmap's "fix the anchor first" note). Haiku 4.5 stubbed as a future
// cheaper path for narrow sub-tasks once volume justifies the split.
const MODEL = "claude-sonnet-5";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set -- expected until the Phase 0 Anthropic account is provisioned.");
    }
    this.client = new Anthropic({ apiKey });
  }

  async runTurn(params: {
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: ConversationMessage[];
  }): Promise<LLMTurnResult> {
    const anthropicMessages = params.messages
      .filter((m) => m.role !== "tool")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: params.systemPrompt,
      tools: params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
      messages: anthropicMessages,
    });

    let assistantText: string | null = null;
    const toolCalls: LLMTurnResult["toolCalls"] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        assistantText = (assistantText ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }

    return {
      assistantText,
      toolCalls,
      stopReason:
        response.stop_reason === "tool_use" ? "tool_use" : response.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
    };
  }
}
