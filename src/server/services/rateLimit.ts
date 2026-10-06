import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash's serverless, REST-based Redis -- no persistent connection to manage from a
// Vercel function. Every limiter fails open when Upstash isn't configured (local dev):
// rate limiting is defence in depth, not something that should take a form down.
const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, limit: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  let limiter = limiters.get(prefix);
  if (!limiter) {
    limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, window), prefix });
    limiters.set(prefix, limiter);
  }
  return limiter;
}

async function check(limiter: Ratelimit | null, key: string): Promise<{ allowed: boolean }> {
  if (!limiter) return { allowed: true };
  const { success } = await limiter.limit(key);
  return { allowed: success };
}

// Chat: keyed by session + IP, sized to stop scripted abuse without throttling a real,
// slow-typing customer.
export function checkRateLimit(key: string) {
  return check(getLimiter("blr_chat", 20, "1 m"), key);
}

// Quote form: public, and every submission costs a Google lookup and sends an email, so
// this is much stricter -- 5 submissions per IP per 10 minutes.
export function checkQuoteRateLimit(key: string) {
  return check(getLimiter("blr_quote", 5, "10 m"), key);
}
