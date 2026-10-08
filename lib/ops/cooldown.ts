import { getRedisConnection } from "@/lib/queue/client";

/**
 * Cooldowns and "once per person" are checked against sent DM logs, but a log
 * is written only after Meta answers. Several messages from one person (or a
 * story with many frames) arrive together and run in parallel, so each would
 * pass that check. An atomic claim per rule and person, taken right before the
 * send, lets exactly one through. `owner` is the triggering message or comment,
 * so a retry of the same job still holds its own claim.
 */
const ONCE_PER_PERSON_SECONDS = 400 * 24 * 60 * 60;
const key = (automationId: string, userId: string) => `openreply:cooldown:${automationId}:${userId}`;

/** minutes = null: once per person. True when this trigger may answer. */
export async function claimCooldown(
  automationId: string,
  userId: string,
  minutes: number | null,
  owner: string
): Promise<boolean> {
  const seconds = minutes === null ? ONCE_PER_PERSON_SECONDS : Math.max(1, Math.round(minutes * 60));
  try {
    const redis = getRedisConnection();
    if ((await redis.set(key(automationId, userId), owner, "EX", seconds, "NX")) === "OK") return true;
    return (await redis.get(key(automationId, userId))) === owner;
  } catch (error) {
    // The sent-log check already ran; without Redis it is the only guard.
    console.warn("[Cooldown] Claim unavailable:", String(error));
    return true;
  }
}

const RELEASE_IF_OURS = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Give the claim back after Meta refused the send, so a later trigger can answer. */
export async function releaseCooldown(automationId: string, userId: string, owner: string) {
  try {
    await getRedisConnection().eval(RELEASE_IF_OURS, 1, key(automationId, userId), owner);
  } catch {
    // It expires on its own.
  }
}
