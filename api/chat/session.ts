import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSession } from "../../src/server/services/chatSession.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "The chat assistant isn't configured yet. Please use the quote form instead." });
    return;
  }

  try {
    const session = await createSession();
    res.status(200).json(session);
  } catch (err) {
    console.error("Chat session creation failed:", err);
    res.status(502).json({ error: "We couldn't start a chat just now. Please use the quote form instead." });
  }
}
