import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../src/server/db/client.js";
import { leads } from "../../src/server/db/schema.js";
import { requireAdminAuth, AdminAuthError } from "../../src/server/services/adminAuth.js";

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

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database isn't configured yet." });
    return;
  }

  try {
    const db = getDb();
    const escalated = await db
      .select()
      .from(leads)
      .where(eq(leads.humanFollowupRequired, true))
      .orderBy(desc(leads.updatedAt));

    res.status(200).json({ leads: escalated });
  } catch (err) {
    console.error("Admin leads fetch failed:", err);
    res.status(502).json({ error: "Couldn't load leads just now." });
  }
}
