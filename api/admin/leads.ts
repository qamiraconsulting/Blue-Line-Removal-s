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

  if (!(await guardAdmin(req, res))) return;

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
