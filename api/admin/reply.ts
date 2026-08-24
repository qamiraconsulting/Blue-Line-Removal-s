import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { conversations, leads, messages } from "@/server/db/schema";
import { requireAdminAuth, AdminAuthError } from "@/server/services/adminAuth";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

// A human reply lands in the same MESSAGES table as the bot's own turns,
// with role: "human_agent" -- per the playbook's Section 7a, an escalated
// conversation reads as one continuous thread, not two separate systems.
// Sending a reply clears human_followup_required on the lead: the
// simplest defensible MVP behavior (it's been picked up), not a claim
// the case is fully closed -- worth revisiting if a distinct "resolved"
// action turns out to be needed alongside "replied".
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
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

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  try {
    const db = getDb();
    const { conversationId, message } = parsed.data;

    await db.insert(messages).values({ conversationId, role: "human_agent", content: message });
    await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, conversationId));
    await db.update(leads).set({ humanFollowupRequired: false }).where(eq(leads.conversationId, conversationId));

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Admin reply failed:", err);
    res.status(502).json({ error: "That reply didn't send. Please try again." });
  }
}
