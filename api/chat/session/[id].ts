import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession } from "@/server/services/chatSession";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing conversation id." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "The chat assistant isn't configured yet." });
    return;
  }

  try {
    const session = await getSession(id);
    if (!session) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    res.status(200).json(session);
  } catch (err) {
    console.error("Chat session resume failed:", err);
    res.status(502).json({ error: "We couldn't resume that chat just now." });
  }
}
