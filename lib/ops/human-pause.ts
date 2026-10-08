import { getRedisConnection } from "@/lib/queue/client";

/**
 * Staff replying by hand should not have the bot talk over them. Every DM the
 * worker sends is marked for a short while; an echo (a message the account
 * itself sent) that arrives without that mark was written by a person, in the
 * Instagram app or an inbox, so automated DM replies to that conversation go
 * quiet for the account's humanPauseMinutes.
 *
 * The mark is set before the send call, so the echo of our own message always
 * finds it. A person typing in the same two minutes as an automated send can
 * be missed; the reverse (pausing on our own message) cannot happen.
 */
const AUTOMATED_MARK_SECONDS = 120;

const automatedKey = (accountId: string, userId: string) =>
  `openreply:automated:${accountId}:${userId}`;
const humanKey = (accountId: string, userId: string) =>
  `openreply:human:${accountId}:${userId}`;

export async function markAutomatedSend(instagramAccountId: string, userId: string) {
  try {
    await getRedisConnection().set(
      automatedKey(instagramAccountId, userId),
      "1",
      "EX",
      AUTOMATED_MARK_SECONDS
    );
  } catch (error) {
    console.warn("[Human pause] Could not mark an automated send:", String(error));
  }
}

export type EchoOrigin = "automated" | "human" | "ignored";

/** Classify an echo and, for a human one, pause automated replies. */
export async function recordEcho(
  instagramAccountId: string,
  userId: string,
  pauseMinutes: number
): Promise<EchoOrigin> {
  if (pauseMinutes <= 0) return "ignored";
  const redis = getRedisConnection();
  if (await redis.exists(automatedKey(instagramAccountId, userId))) return "automated";
  await redis.set(humanKey(instagramAccountId, userId), "1", "EX", Math.round(pauseMinutes * 60));
  return "human";
}

/** True while a person is handling this conversation. Fails open on Redis errors. */
export async function isHumanHandling(instagramAccountId: string, userId: string) {
  try {
    return (await getRedisConnection().exists(humanKey(instagramAccountId, userId))) === 1;
  } catch {
    return false;
  }
}
