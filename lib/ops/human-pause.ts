import { getRedisConnection } from "@/lib/queue/client";

/**
 * Staff replying by hand should not have the bot talk over them. An echo (a
 * message the account itself sent) is ours when its message id is one an
 * automated send returned; anything else was written by a person, in the
 * Instagram app or the inbox, so automated DM replies to that conversation go
 * quiet for the account's humanPauseMinutes.
 *
 * Meta can deliver the echo before the send call returns its id, so every
 * automated send also marks the conversation for a few seconds beforehand.
 * Late or re-delivered echoes are recognised by id, however late they come.
 */
const AUTOMATED_MARK_SECONDS = 30;
const SENT_MID_SECONDS = 2 * 24 * 60 * 60;

const sentMidKey = (mid: string) => `openreply:sentmid:${mid}`;

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

/** Remember the id of a message an automated send delivered. */
export async function rememberSentMid(mid: string) {
  try {
    await getRedisConnection().set(sentMidKey(mid), "1", "EX", SENT_MID_SECONDS);
  } catch (error) {
    console.warn("[Human pause] Could not remember a sent message:", String(error));
  }
}

export type EchoOrigin = "automated" | "human" | "ignored";

/** Classify an echo and, for a human one, pause automated replies. */
export async function recordEcho(
  instagramAccountId: string,
  userId: string,
  pauseMinutes: number,
  mid?: string
): Promise<EchoOrigin> {
  if (pauseMinutes <= 0) return "ignored";
  const redis = getRedisConnection();
  if (mid && (await redis.exists(sentMidKey(mid)))) return "automated";
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

/** Pause automated replies right away, e.g. when someone replies from the inbox. */
export async function pauseForHuman(instagramAccountId: string, userId: string, pauseMinutes: number) {
  if (pauseMinutes <= 0) return;
  try {
    await getRedisConnection().set(humanKey(instagramAccountId, userId), "1", "EX", Math.round(pauseMinutes * 60));
  } catch (error) {
    console.warn("[Human pause] Could not pause:", String(error));
  }
}
