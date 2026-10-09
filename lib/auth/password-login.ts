import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { isEmailAllowedToSignIn } from "@/lib/env";
import { decoyHash, verifyPassword } from "./password";

/** Same lifetime Auth.js gives database sessions. */
export const SESSION_DAYS = 30;
const EMAIL_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 20;
const LOCK_SECONDS = 15 * 60;

export type PasswordLoginResult =
  | { ok: true; sessionToken: string; expires: Date }
  | { ok: false; reason: "invalid" | "locked" };

const emailKey = (email: string) => `openreply:pwfail:email:${email}`;
const ipKey = (ip: string) => `openreply:pwfail:ip:${ip}`;

async function failures(key: string): Promise<number> {
  try {
    return Number((await getRedisConnection().get(key)) ?? 0);
  } catch {
    return 0;
  }
}

async function countFailure(key: string) {
  try {
    const redis = getRedisConnection();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, LOCK_SECONDS);
  } catch {
    // Without Redis the attempt is simply not counted.
  }
}

/**
 * Check an email and password and open a session the same way Auth.js does
 * for its database strategy (a Session row plus the session cookie), so the
 * rest of the app sees an ordinary signed-in user. Repeated failures lock the
 * address, and the network address, for 15 minutes.
 */
export async function passwordLogin(input: { email: string; password: string; ip: string | null }): Promise<PasswordLoginResult> {
  const email = input.email.trim().toLowerCase();
  if ((await failures(emailKey(email))) >= EMAIL_FAILURE_LIMIT) return { ok: false, reason: "locked" };
  if (input.ip && (await failures(ipKey(input.ip))) >= IP_FAILURE_LIMIT) return { ok: false, reason: "locked" };

  const user = isEmailAllowedToSignIn(email)
    ? await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } })
    : null;
  // Always spend the hashing time, so a response does not reveal whether the account exists.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await decoyHash()));
  if (!user?.passwordHash || !valid) {
    await countFailure(emailKey(email));
    if (input.ip) await countFailure(ipKey(input.ip));
    return { ok: false, reason: "invalid" };
  }

  try {
    await getRedisConnection().del(emailKey(email));
  } catch {
    // Expires on its own.
  }
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });
  return { ok: true, sessionToken, expires };
}

/** The cookie Auth.js reads its database session from. */
export function sessionCookieName(baseUrl: string) {
  return baseUrl.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}
