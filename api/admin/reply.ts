import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { setConversationMode } from "../../src/server/chat/session.js";
import { getDb } from "../../src/server/db/client.js";
import { leads, messages } from "../../src/server/db/schema.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Dashboard actions on a chat:
//  - send a reply: lands in the same MESSAGES table as role "human_agent" (one continuous
//    thread -- the customer's widget polls and shows it), puts the chat in "human" mode so
//    the assistant stops answering, and clears the "needs follow-up" flag (picked up).
//  - hand back: returns the chat to the assistant ("bot" mode), with or without a message.
const bodySchema = z
  .object({
    conversationId: z.string().uuid(),
    message: z.string().trim().max(4000).optional(),
    handBackToAssistant: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.message) || b.handBackToAssistant, { message: "Nothing to do." });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!(await guardAdmin(req, res))) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  try {
    const db = getDb();
    const { conversationId, message, handBackToAssistant } = parsed.data;
    const mode = handBackToAssistant ? "bot" : "human";

    if (message) await db.insert(messages).values({ conversationId, role: "human_agent", content: message });
    await setConversationMode(conversationId, mode);
    await db.update(leads).set({ humanFollowupRequired: false, updatedAt: new Date() }).where(eq(leads.conversationId, conversationId));

    res.status(200).json({ ok: true, mode });
  } catch (err) {
    console.error("Admin reply failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "That reply didn't send. Please try again." });
  }
}
