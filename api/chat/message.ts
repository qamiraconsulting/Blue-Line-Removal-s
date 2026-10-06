import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { ConversationNotFoundError, postMessage } from "../../src/server/chat/session.js";
import { checkRateLimit } from "../../src/server/services/rateLimit.js";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "The chat assistant isn't configured yet. Please use the quote form instead." });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`${parsed.data.conversationId}:${ip}`);
  if (!allowed) {
    res.status(429).json({ error: "Too many messages -- please slow down a little." });
    return;
  }

  try {
    const reply = await postMessage(parsed.data.conversationId, parsed.data.message);
    res.status(200).json({ reply });
  } catch (err) {
    if (err instanceof ConversationNotFoundError) {
      res.status(404).json({ error: "This chat has expired. Please refresh to start a new one." });
      return;
    }
    console.error("Chat message failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ error: "That message didn't send. Please try again." });
  }
}
