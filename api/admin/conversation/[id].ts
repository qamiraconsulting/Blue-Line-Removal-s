import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { conversations, leads, messages } from "@/server/db/schema";
import { requireAdminAuth, AdminAuthError } from "@/server/services/adminAuth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await requireAdminAuth(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }

  const conversationId = typeof req.query.id === "string" ? req.query.id : "";
  if (!conversationId) {
    res.status(400).json({ error: "Missing conversation id." });
    return;
  }

  try {
    const db = getDb();
    const [conversation, lead, history] = await Promise.all([
      db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) }),
      db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) }),
      db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt),
    ]);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    res.status(200).json({ conversation, lead: lead ?? null, messages: history });
  } catch (err) {
    console.error("Admin conversation fetch failed:", err);
    res.status(502).json({ error: "Couldn't load that conversation just now." });
  }
}
