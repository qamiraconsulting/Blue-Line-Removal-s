import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client.js";
import { leads } from "../../src/server/db/schema.js";
import { guardAdmin } from "../../src/server/services/adminAuth.js";

// Chats waiting for a person (human_followup_required), newest activity first.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const admin = await guardAdmin(req, res);
  if (!admin) return;

  // ?me=1: what this user may see (the dashboard hides Settings from limited users).
  if (req.query.me) {
    res.status(200).json({ role: admin.role });
    return;
  }

  if (admin.role !== "full") {
    res.status(403).json({ error: "Chats are for full dashboard users." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database isn't configured yet." });
    return;
  }

  try {
    const escalated = await getDb().select().from(leads).where(eq(leads.humanFollowupRequired, true)).orderBy(desc(leads.updatedAt));
    res.status(200).json({ leads: escalated });
  } catch (err) {
    console.error("Admin leads fetch failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "Couldn't load leads just now." });
  }
}
