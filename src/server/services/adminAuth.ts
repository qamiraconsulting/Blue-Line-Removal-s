import type { VercelRequest } from "@vercel/node";
import { verifyToken } from "@clerk/backend";

// Real security boundary for the internal dashboard lives here, not in the
// frontend route gate. Since the site is ssr:false (static + client-side
// SPA fallback -- see react-router.config.ts and vercel.json), there's no
// per-request server checking a session before HTML ships; anyone could
// hit /api/admin/* directly regardless of what the UI shows. Every admin
// API handler must call this before touching the database.

export class AdminAuthError extends Error {}

export async function requireAdminAuth(req: VercelRequest): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new AdminAuthError("CLERK_SECRET_KEY is not set -- the admin dashboard isn't configured yet.");
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    throw new AdminAuthError("Missing Authorization header.");
  }

  try {
    await verifyToken(token, { secretKey });
  } catch {
    throw new AdminAuthError("Invalid or expired session.");
  }
}
