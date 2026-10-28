import { describe, expect, it } from "vitest";
import { AdminAuthError, requireAdminAuth } from "./adminAuth.js";

const env = { CLERK_SECRET_KEY: "sk_test", ADMIN_USER_IDS: "user_ayesha, user_irfan" };
const verify = async (token: string) => {
  if (token === "bad") throw new Error("invalid");
  return { sub: token };
};
const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });

const rejects = async (promise: Promise<unknown>, status: number) => {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AdminAuthError);
  expect((err as AdminAuthError).status).toBe(status);
};

describe("requireAdminAuth", () => {
  it("lets in a signed-in user on the allow-list", async () => {
    await expect(requireAdminAuth(req("user_irfan"), { env, verify })).resolves.toEqual({ userId: "user_irfan", role: "full" });
  });

  it("refuses a valid Clerk session that isn't on the list (anyone could sign up)", async () => {
    await rejects(requireAdminAuth(req("user_stranger"), { env, verify }), 403);
  });

  it("lets nobody in when the list is empty", async () => {
    await rejects(requireAdminAuth(req("user_ayesha"), { env: { CLERK_SECRET_KEY: "sk_test" }, verify }), 403);
  });

  it("refuses missing or invalid sessions, and reports missing configuration", async () => {
    await rejects(requireAdminAuth(req(), { env, verify }), 401);
    await rejects(requireAdminAuth(req("bad"), { env, verify }), 401);
    await rejects(requireAdminAuth(req("user_ayesha"), { env: {}, verify }), 500);
  });
});

describe("access by verified email (Blue Line, 28 Oct)", () => {
  const byEmail = { CLERK_SECRET_KEY: "sk_test", ADMIN_EMAILS: "Owner@Example.com, boss@example.com", ADMIN_LIMITED_EMAILS: "matt@example.com" };
  const emailsOf: Record<string, string[]> = { user_owner: ["owner@example.com"], user_matt: ["matt@example.com"], user_other: ["someone@example.com"] };
  const lookupEmails = async (userId: string) => emailsOf[userId] ?? [];

  it("full and limited lists give the matching role (case doesn't matter)", async () => {
    await expect(requireAdminAuth(req("user_owner"), { env: byEmail, verify, lookupEmails })).resolves.toEqual({ userId: "user_owner", role: "full" });
    await expect(requireAdminAuth(req("user_matt"), { env: byEmail, verify, lookupEmails })).resolves.toEqual({ userId: "user_matt", role: "limited" });
  });

  it("an email on neither list is refused, and the message names it so it can be added", async () => {
    const err = await requireAdminAuth(req("user_other"), { env: byEmail, verify, lookupEmails }).catch((e: unknown) => e);
    expect((err as AdminAuthError).status).toBe(403);
    expect((err as AdminAuthError).message).toContain("someone@example.com");
  });

  it("a user ID in ADMIN_USER_IDS still has full access without an email lookup", async () => {
    const noLookup = async () => {
      throw new Error("should not be called");
    };
    await expect(requireAdminAuth(req("user_ayesha"), { env: { ...byEmail, ADMIN_USER_IDS: "user_ayesha" }, verify, lookupEmails: noLookup })).resolves.toEqual({ userId: "user_ayesha", role: "full" });
  });
});
