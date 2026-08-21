// AnthropicProvider is the default implementation; OpenAIProvider/others
// stubbed but not built, per architecture doc Section 3.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema, doubles as the Zod-schema source -- see src/server/tools
}

export interface ConversationMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMTurnResult {
  assistantText: string | null;
  toolCalls: ToolCallRequest[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
}

export interface LLMProvider {
  runTurn(params: {
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: ConversationMessage[];
  }): Promise<LLMTurnResult>;
}
