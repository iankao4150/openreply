import { getRedisConnection } from "@/lib/queue/client";

/**
 * "Text first" comment replies: the private reply is plain text, and the
 * campaign's module goes out when the person writes back. Instagram's
 * messaging window lasts 24 hours from their reply, so the promise is kept for
 * a day.
 */
const PENDING_SECONDS = 24 * 60 * 60;
const key = (accountId: string, userId: string) => `openreply:pending:${accountId}:${userId}`;

export async function setPendingModule(instagramAccountId: string, userId: string, automationId: string) {
  await getRedisConnection().set(key(instagramAccountId, userId), automationId, "EX", PENDING_SECONDS);
}

/** Read and clear the pending campaign for this person, atomically. */
export async function takePendingModule(instagramAccountId: string, userId: string) {
  try {
    return await getRedisConnection().getdel(key(instagramAccountId, userId));
  } catch {
    return null;
  }
}
