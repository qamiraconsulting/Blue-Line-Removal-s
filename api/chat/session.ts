import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSession } from "../../src/server/chat/session.js";
import { checkChatSessionRateLimit } from "../../src/server/services/rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "The chat assistant isn't available yet.", unavailable: true });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkChatSessionRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: "Too many new chats from this connection -- please try again later." });
    return;
  }

  try {
    const session = await createSession();
    res.status(200).json(session);
  } catch (err) {
    console.error("Chat session creation failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "We couldn't start a chat just now. Please use the quote form instead." });
  }
}
