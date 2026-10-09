import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = new Map<string, number>();
  return {
    store,
    users: new Map<string, { id: string; passwordHash: string | null }>(),
    sessions: [] as { sessionToken: string; userId: string; expires: Date }[],
    redis: {
      get: vi.fn(async (key: string) => (store.has(key) ? String(store.get(key)) : null)),
      incr: vi.fn(async (key: string) => {
        store.set(key, (store.get(key) ?? 0) + 1);
        return store.get(key)!;
      }),
      expire: vi.fn(async () => 1),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    },
  };
});
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => h.redis }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: { where: { email: string } }) => h.users.get(where.email) ?? null) },
    session: {
      create: vi.fn(async ({ data }: { data: { sessionToken: string; userId: string; expires: Date } }) => {
        h.sessions.push(data);
        return data;
      }),
    },
  },
}));

import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { passwordLogin, sessionCookieName } from "@/lib/auth/password-login";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("refuses short and trivial passwords", () => {
    expect(passwordProblem("short")).toBe("too_short");
    expect(passwordProblem("aaaaaaaaaa")).toBe("too_simple");
    expect(passwordProblem("12345678")).toBe("too_simple");
    expect(passwordProblem("ofsyd-messi-256")).toBeNull();
  });
});

describe("signing in with a password", () => {
  beforeEach(async () => {
    h.store.clear();
    h.sessions.length = 0;
    h.users.clear();
    process.env.ALLOWED_EMAILS = "staff@example.com,other@example.com";
    h.users.set("staff@example.com", { id: "u1", passwordHash: await hashPassword("ofsyd-messi-256") });
    h.users.set("other@example.com", { id: "u2", passwordHash: null });
  });

  it("opens a 30-day session for the right password, matching email case-insensitively", async () => {
    const result = await passwordLogin({ email: " Staff@Example.com ", password: "ofsyd-messi-256", ip: "1.2.3.4" });
    expect(result.ok).toBe(true);
    expect(h.sessions).toHaveLength(1);
    expect(h.sessions[0].userId).toBe("u1");
    const days = (h.sessions[0].expires.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("gives the same answer for a wrong password, an account without one and an unknown address", async () => {
    for (const [email, password] of [
      ["staff@example.com", "wrong-password"],
      ["other@example.com", "anything-at-all"],
      ["nobody@example.com", "anything-at-all"],
    ]) {
      expect(await passwordLogin({ email, password, ip: null })).toEqual({ ok: false, reason: "invalid" });
    }
    expect(h.sessions).toHaveLength(0);
  });

  it("refuses addresses that are not allowed to sign in", async () => {
    process.env.ALLOWED_EMAILS = "other@example.com";
    expect(await passwordLogin({ email: "staff@example.com", password: "ofsyd-messi-256", ip: null })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("locks an address after five failures, even for the right password", async () => {
    for (let i = 0; i < 5; i++) await passwordLogin({ email: "staff@example.com", password: "nope-nope", ip: null });
    expect(await passwordLogin({ email: "staff@example.com", password: "ofsyd-messi-256", ip: null })).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("uses the secure cookie name on https", () => {
    expect(sessionCookieName("https://ofsyd-reply.vercel.app")).toBe("__Secure-authjs.session-token");
    expect(sessionCookieName("http://localhost:3217")).toBe("authjs.session-token");
  });
});
