import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken } from "@clerk/backend";

// Real security boundary for the internal dashboard lives here, not in the
// frontend route gate. Since the site is ssr:false (static + client-side
// SPA fallback -- see react-router.config.ts and vercel.json), there's no
// per-request server checking a session before HTML ships; anyone could
// hit /api/admin/* directly regardless of what the UI shows. Every admin
// API handler must call this before touching the database.
//
// A valid Clerk session is NOT enough: anyone able to sign up to the Clerk app
// would get one. Access also requires the user's Clerk ID to be listed in
// ADMIN_USER_IDS (comma-separated). An empty list lets nobody in.

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 500,
  ) {
    super(message);
  }
}

type Verify = (token: string, options: { secretKey: string }) => Promise<{ sub: string }>;

export function adminUserIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function requireAdminAuth(
  req: Pick<VercelRequest, "headers">,
  deps: { env?: Record<string, string | undefined>; verify?: Verify } = {},
): Promise<{ userId: string }> {
  const env = deps.env ?? process.env;
  const verify = deps.verify ?? (verifyToken as unknown as Verify);

  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new AdminAuthError("CLERK_SECRET_KEY is not set -- the admin dashboard isn't configured yet.", 500);
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) throw new AdminAuthError("Missing Authorization header.", 401);

  let userId: string;
  try {
    userId = (await verify(token, { secretKey })).sub;
  } catch {
    throw new AdminAuthError("Invalid or expired session.", 401);
  }

  if (!adminUserIds(env).has(userId)) {
    // The ID is the user's own, so it's safe to show -- it's what goes into ADMIN_USER_IDS.
    throw new AdminAuthError(`This account isn't allowed into the dashboard yet. Ask Qamira to add user ID ${userId}.`, 403);
  }
  return { userId };
}

/** For handlers: sends the error response and returns null when the caller isn't an admin. */
export async function guardAdmin(req: VercelRequest, res: VercelResponse): Promise<{ userId: string } | null> {
  try {
    return await requireAdminAuth(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}
