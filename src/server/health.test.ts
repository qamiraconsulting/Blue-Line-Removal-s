import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/health.js";

function call() {
  const out: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      out.body = body;
      return res;
    },
  };
  return handler({ method: "GET" } as VercelRequest, res as unknown as VercelResponse).then(() => out);
}

afterEach(() => vi.unstubAllEnvs());

describe("/api/health", () => {
  it("reports what's configured as yes/no, and never echoes a secret", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("RESEND_API_KEY", "re_secret_value");
    vi.stubEnv("LEAD_FROM_EMAIL", "quotes@example.com");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_secret");
    vi.stubEnv("ADMIN_USER_IDS", "");

    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      database: "not_configured",
      email: true,
      chatAssistant: false,
      adminDashboard: false, // a Clerk key alone isn't enough without ADMIN_USER_IDS
      rateCard: { status: "placeholder" },
    });
    expect(JSON.stringify(body)).not.toMatch(/re_secret_value|sk_secret|quotes@example\.com/);
  });
});
