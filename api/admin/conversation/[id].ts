import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../src/server/db/client.js";
import { conversations, leads, messages, quotes } from "../../../src/server/db/schema.js";
import { guardAdmin } from "../../../src/server/services/adminAuth.js";

// One chat for the dashboard: transcript, the lead (contact details), and any quotes it produced.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!(await guardAdmin(req, res))) return;

  const conversationId = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
    res.status(400).json({ error: "Missing or invalid conversation id." });
    return;
  }

  try {
    const db = getDb();
    const [conversation, lead, history, chatQuotes] = await Promise.all([
      db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) }),
      db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) }),
      db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt),
      db
        .select({
          reference: quotes.reference,
          createdAt: quotes.createdAt,
          status: quotes.status,
          manualReason: quotes.manualReason,
          amountAud: quotes.amountAud,
          truck: quotes.truck,
          movers: quotes.movers,
          movingDate: quotes.movingDate,
        })
        .from(quotes)
        .where(eq(quotes.conversationId, conversationId))
        .orderBy(desc(quotes.createdAt)),
    ]);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    res.status(200).json({ conversation, lead: lead ?? null, messages: history, quotes: chatQuotes });
  } catch (err) {
    console.error("Admin conversation fetch failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't load that conversation just now." });
  }
}
