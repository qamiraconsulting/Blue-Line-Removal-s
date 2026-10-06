import Anthropic from "@anthropic-ai/sdk";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { conversations, messages } from "../db/schema.js";
import { buildQuoteDeps } from "../quote/deps.js";
import { runAgentTurn, type StoredTurn } from "./agent.js";
import { dbLeadStore } from "./leadStore.js";
import { buildSystemPrompt, GREETING } from "./systemPrompt.js";
import { createToolRunner, type ToolRecord } from "./tools.js";

// Database-backed chat sessions for api/chat/*. The customer-facing transcript is the
// `messages` table; tool activity (quote reference, quoted amount) is kept on the
// assistant row so a later "you told me $X" can be checked.

const HISTORY_LIMIT = 40;

export async function createSession() {
  const db = getDb();
  const [conversation] = await db.insert(conversations).values({}).returning({ id: conversations.id });
  await db.insert(messages).values({ conversationId: conversation!.id, role: "assistant", content: GREETING });
  return { conversationId: conversation!.id, greeting: GREETING };
}

export async function getSession(conversationId: string) {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) return null;

  const history = await db
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  return {
    conversationId,
    messages: history.map((m) => ({ id: m.id, role: m.role === "user" ? "user" : "assistant", content: m.content })),
  };
}

export class ConversationNotFoundError extends Error {}

export async function postMessage(conversationId: string, userMessage: string): Promise<string> {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) throw new ConversationNotFoundError();

  await db.insert(messages).values({ conversationId, role: "user", content: userMessage });

  const rows = await db
    .select({ role: messages.role, content: messages.content, toolCalls: messages.toolCalls })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);
  rows.reverse();

  // Every amount quoted earlier in this chat (the guard allows repeating those).
  const previouslyQuoted = rows.flatMap((r) =>
    ((r.toolCalls as ToolRecord[] | null) ?? []).flatMap((t) => (t.quotedAmountAud === undefined ? [] : [t.quotedAmountAud])),
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const runTool = createToolRunner({ quoteDeps: buildQuoteDeps(), leads: dbLeadStore, conversationId });

  const turn = await runAgentTurn({
    createMessage: (params) => client.messages.create(params),
    model: process.env.ANTHROPIC_MODEL || undefined,
    systemPrompt: buildSystemPrompt(),
    history: rows as StoredTurn[],
    runTool,
    previouslyQuoted,
  });

  if (turn.blocked) console.error("chat reply blocked by price guard", { conversationId, reason: turn.blocked });

  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content: turn.reply,
    toolCalls: turn.toolRecords.length ? turn.toolRecords : null,
  });
  await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));

  return turn.reply;
}
