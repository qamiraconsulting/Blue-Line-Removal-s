import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession } from "../../../src/server/chat/session.js";

// Resume a chat, and the widget's poll for team replies while a person is handling it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "Missing or invalid conversation id." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "The chat assistant isn't available yet.", unavailable: true });
    return;
  }

  try {
    const session = await getSession(id);
    if (!session) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(session);
  } catch (err) {
    console.error("Chat session resume failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "We couldn't resume that chat just now." });
  }
}
