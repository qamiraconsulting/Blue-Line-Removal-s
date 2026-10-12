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
    await expect(requireAdminAuth(req("user_irfan"), { env, verify })).resolves.toEqual({ userId: "user_irfan" });
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
