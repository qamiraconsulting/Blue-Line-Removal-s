import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClerkClient, verifyToken } from "@clerk/backend";

// Real security boundary for the internal dashboard lives here, not in the
// frontend route gate. Since the site is ssr:false (static + client-side
// SPA fallback -- see react-router.config.ts and vercel.json), there's no
// per-request server checking a session before HTML ships; anyone could
// hit /api/admin/* directly regardless of what the UI shows. Every admin
// API handler must call this before touching the database.
//
// A valid Clerk session is NOT enough: anyone able to sign up to the Clerk app
// would get one. Access also needs the user's VERIFIED email address on a list
// (Blue Line, 28 Oct 2026):
//   ADMIN_EMAILS          full access (comma-separated)
//   ADMIN_LIMITED_EMAILS  limited access -- bookings, trucks and drivers per trip, but not
//                         Settings (booking settings, days off, the driver and truck lists)
// ADMIN_USER_IDS (Clerk user IDs) still gives full access, as before. Empty lists let nobody in.

export type AdminRole = "full" | "limited";

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 500,
  ) {
    super(message);
  }
}

type Verify = (token: string, options: { secretKey: string }) => Promise<{ sub: string }>;
/** The user's verified email addresses, lower case. */
type LookupEmails = (userId: string, secretKey: string) => Promise<string[]>;

const list = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

export function adminUserIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// One Clerk lookup per user per few minutes, not one per dashboard request.
const emailCache = new Map<string, { emails: string[]; at: number }>();
const CACHE_MS = 5 * 60_000;

const clerkEmails: LookupEmails = async (userId, secretKey) => {
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.emails;
  const user = await createClerkClient({ secretKey }).users.getUser(userId);
  const emails = user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase());
  emailCache.set(userId, { emails, at: Date.now() });
  return emails;
};

export async function requireAdminAuth(
  req: Pick<VercelRequest, "headers">,
  deps: { env?: Record<string, string | undefined>; verify?: Verify; lookupEmails?: LookupEmails } = {},
): Promise<{ userId: string; role: AdminRole }> {
  const env = deps.env ?? process.env;
  const verify = deps.verify ?? (verifyToken as unknown as Verify);
  const lookupEmails = deps.lookupEmails ?? clerkEmails;

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

  if (adminUserIds(env).has(userId)) return { userId, role: "full" };

  const full = list(env.ADMIN_EMAILS);
  const limited = list(env.ADMIN_LIMITED_EMAILS);
  let emails: string[] = [];
  if (full.size || limited.size) {
    try {
      emails = await lookupEmails(userId, secretKey);
    } catch {
      throw new AdminAuthError("Couldn't check your account just now -- try again in a minute.", 500);
    }
  }
  if (emails.some((e) => full.has(e))) return { userId, role: "full" };
  if (emails.some((e) => limited.has(e))) return { userId, role: "limited" };

  // The user's own email is safe to show -- it's what goes on the list.
  const shown = emails[0] ?? "the email you signed in with";
  throw new AdminAuthError(`This account isn't allowed into the dashboard yet. Ask Qamira to add ${shown}.`, 403);
}

/**
 * For handlers: sends the error response and returns null when the caller isn't allowed.
 * need "full" refuses limited users too (403).
 */
export async function guardAdmin(req: VercelRequest, res: VercelResponse, need: AdminRole = "limited"): Promise<{ userId: string; role: AdminRole } | null> {
  try {
    const admin = await requireAdminAuth(req);
    if (need === "full" && admin.role !== "full") {
      res.status(403).json({ error: "Only full dashboard users can change this." });
      return null;
    }
    return admin;
  } catch (err) {
    if (err instanceof AdminAuthError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}
