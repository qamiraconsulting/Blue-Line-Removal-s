import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { conversations, messages } from "../db/schema.js";
import { AnthropicProvider } from "../providers/llm/AnthropicProvider.js";
import { toolDefinitions } from "../tools/definitions.js";
import { buildSystemPrompt } from "../tools/systemPrompt.js";
import { executeToolCall } from "../tools/executeToolCall.js";

const GREETING =
  "Hi! I'm Blue's chat assistant \u{1F44B} I can give you an instant estimate for your move -- want to get started?";

export async function createSession() {
  const db = getDb();
  const [conversation] = await db.insert(conversations).values({ state: "GREETING" }).returning();

  await db.insert(messages).values({
    conversationId: conversation.id,
    role: "assistant",
    content: GREETING,
  });

  return { conversationId: conversation.id, greeting: GREETING };
}

export async function getSession(conversationId: string) {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) return null;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  return {
    conversation,
    messages: history
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "human_agent")
      .map((m) => ({ id: m.id, role: m.role === "human_agent" ? "assistant" : m.role, content: m.content })),
  };
}

// The chat + tool loop -- architecture doc Section 12's /api/chat/message.
// The LLM only ever talks to the Tool Layer (executeToolCall); it never
// touches the database or an external API directly. Loops until the model
// stops requesting tools or hits a safety cap, per Anthropic's standard
// tool-use pattern.
const MAX_TOOL_ROUNDS = 5;

export async function postMessage(conversationId: string, userMessage: string) {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) throw new Error("Conversation not found");

  await db.insert(messages).values({ conversationId, role: "user", content: userMessage });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(40);

  const conversationHistory = history
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const llm = new AnthropicProvider();
  const systemPrompt = buildSystemPrompt();

  let assistantReply: string | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await llm.runTurn({ systemPrompt, tools: toolDefinitions, messages: conversationHistory });

    if (turn.assistantText) {
      conversationHistory.push({ role: "assistant", content: turn.assistantText });
    }

    if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) {
      assistantReply = turn.assistantText;
      break;
    }

    for (const call of turn.toolCalls) {
      const result = await executeToolCall(call.name, call.input, conversationId);
      // Tool results are data, never re-interpreted as instructions -- fed
      // back as plain conversation text, per architecture doc Section 13's
      // prompt-injection guard.
      conversationHistory.push({
        role: "user",
        content: `[Tool result for ${call.name}]: ${JSON.stringify(result)}`,
      });
    }
  }

  const finalReply = assistantReply ?? "Sorry, I need a moment -- could you try that again?";
  await db.insert(messages).values({ conversationId, role: "assistant", content: finalReply });
  await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));

  return finalReply;
}
