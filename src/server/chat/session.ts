import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import { site } from "../../data/site.js";
import { getDb } from "../db/client.js";
import { conversations, leads, messages } from "../db/schema.js";
import { dbBookingStore } from "../quote/booking.js";
import { buildQuoteDeps } from "../quote/deps.js";
import { DEFAULT_EFFORT, runAgentTurn, type StoredTurn } from "./agent.js";
import { dbLeadStore } from "./leadStore.js";
import { buildSystemPrompt, GREETING } from "./systemPrompt.js";
import { createToolRunner, type ToolRecord } from "./tools.js";

// Database-backed chat sessions for api/chat/*. The customer-facing transcript is the
// `messages` table; tool activity (quote reference, amount) and token usage are kept on the
// assistant row so "you told me $X" and "what does the chat cost" can both be answered.

const HISTORY_LIMIT = 40;
// Cost and abuse ceiling: a real enquiry never needs this many messages.
export const MAX_CUSTOMER_MESSAGES = 60;
export const LIMIT_REPLY = `We've covered a lot in this chat! To keep going, please call us on ${site.phone.display} or start a new chat.`;

export type ClientRole = "user" | "assistant" | "team";

export interface ChatSnapshot {
  conversationId: string;
  messages: Array<{ id: string; role: ClientRole; content: string }>;
  /** A person has been asked to (or has started to) reply -- the widget polls for their message. */
  awaitingTeam: boolean;
}

export interface MessageResult {
  /** null while a team member is handling the chat -- their reply arrives by polling. */
  reply: string | null;
  awaitingTeam: boolean;
  /** For analytics: what the chat produced this turn. */
  outcome: "estimate" | "booking_requested" | "personal_quote" | "handoff" | null;
}

export class ConversationNotFoundError extends Error {}

const clientRole = (role: string): ClientRole => (role === "user" ? "user" : role === "human_agent" ? "team" : "assistant");

let anthropic: Anthropic | null = null;
function client() {
  // 25s per request, one retry: a stalled call fails inside the function's time limit.
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
  return anthropic;
}

export async function createSession() {
  const db = getDb();
  const [conversation] = await db.insert(conversations).values({}).returning({ id: conversations.id });
  await db.insert(messages).values({ conversationId: conversation!.id, role: "assistant", content: GREETING });
  return { conversationId: conversation!.id, greeting: GREETING };
}

async function awaitingTeam(conversationId: string, mode: string): Promise<boolean> {
  if (mode === "human") return true;
  const [lead] = await getDb()
    .select({ flagged: leads.humanFollowupRequired })
    .from(leads)
    .where(eq(leads.conversationId, conversationId))
    .limit(1);
  return lead?.flagged ?? false;
}

export async function getSession(conversationId: string): Promise<ChatSnapshot | null> {
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
    messages: history.map((m) => ({ id: m.id, role: clientRole(m.role), content: m.content })),
    awaitingTeam: await awaitingTeam(conversationId, conversation.mode),
  };
}

export async function postMessage(conversationId: string, userMessage: string): Promise<MessageResult> {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) throw new ConversationNotFoundError();

  await db.insert(messages).values({ conversationId, role: "user", content: userMessage });
  await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));

  const runTool = createToolRunner({ quoteDeps: buildQuoteDeps(), leads: dbLeadStore, bookings: dbBookingStore, conversationId });

  // A team member has taken over: store the message, put the chat back on the dashboard
  // (this also emails the team if it wasn't already waiting), and let the person reply.
  if (conversation.mode === "human") {
    await runTool("request_human_followup", { reason: "Customer replied in a chat the team is handling" });
    return { reply: null, awaitingTeam: true, outcome: null };
  }

  const rows = await db
    .select({ role: messages.role, content: messages.content, toolCalls: messages.toolCalls })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);
  rows.reverse();

  const customerMessages = await db.$count(messages, and(eq(messages.conversationId, conversationId), eq(messages.role, "user")));
  if (customerMessages > MAX_CUSTOMER_MESSAGES) {
    await db.insert(messages).values({ conversationId, role: "assistant", content: LIMIT_REPLY });
    return { reply: LIMIT_REPLY, awaitingTeam: false, outcome: null };
  }

  // Every amount quoted earlier in this chat (the guard allows repeating those).
  const previouslyQuoted = rows.flatMap((r) =>
    ((r.toolCalls as ToolRecord[] | null) ?? []).flatMap((t) => (t.quotedAmountAud === undefined ? [] : [t.quotedAmountAud])),
  );

  const turn = await runAgentTurn({
    createMessage: (params) => client().beta.messages.create(params),
    model: process.env.ANTHROPIC_MODEL || undefined,
    effort: (process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | undefined) || DEFAULT_EFFORT,
    systemPrompt: buildSystemPrompt(),
    history: rows as StoredTurn[],
    runTool,
    previouslyQuoted,
  });

  if (turn.blocked) console.error("chat reply blocked by price guard", { conversationId, reason: turn.blocked });
  if (turn.declined) {
    await runTool("request_human_followup", { reason: "The assistant couldn't help with a message" });
    turn.toolRecords.push({ name: "request_human_followup", outcome: "model_declined" });
  }

  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content: turn.reply,
    toolCalls: turn.toolRecords.length ? turn.toolRecords : null,
    usage: turn.usage,
  });

  const outcome = turn.toolRecords.some((r) => r.outcome === "booking_requested")
    ? "booking_requested"
    : turn.toolRecords.some((r) => r.outcome === "priced" || r.outcome === "priced_test")
      ? "estimate"
    : turn.toolRecords.some((r) => r.name === "get_quote" && r.outcome === "manual")
      ? "personal_quote"
      : turn.toolRecords.some((r) => r.name === "request_human_followup")
        ? "handoff"
        : null;

  return { reply: turn.reply, awaitingTeam: await awaitingTeam(conversationId, conversation.mode), outcome };
}

/** Admin: a team member replied (takes over) or handed the chat back to the assistant. */
export async function setConversationMode(conversationId: string, mode: "bot" | "human") {
  await getDb().update(conversations).set({ mode, lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));
}
