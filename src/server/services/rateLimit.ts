import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash's serverless, REST-based Redis -- no persistent connection to
// manage from a Vercel function. Keyed by session + IP, sized to stop
// scripted abuse without throttling a real, slow-typing customer
// (architecture doc Section 13).
let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "blr_chat",
    });
  }
  return limiter;
}

export async function checkRateLimit(key: string): Promise<{ allowed: boolean }> {
  const rl = getLimiter();
  // Fails open when Upstash isn't configured yet (Phase 0) -- rate
  // limiting is a defence-in-depth measure, not something that should take
  // the whole chat down if the env vars aren't set locally.
  if (!rl) return { allowed: true };

  const { success } = await rl.limit(key);
  return { allowed: success };
}
