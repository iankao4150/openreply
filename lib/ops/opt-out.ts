import { prisma } from "@/lib/db/client";

/**
 * Meta's messaging policy requires an easy way to stop automated messages and
 * honouring it right away. A DM that is exactly one of these words (ignoring
 * case, spaces and punctuation) opts the person out of every automated DM from
 * the account, or back in.
 */
const STOP_WORDS = new Set(["stop", "unsubscribe", "停止", "取消訂閱", "退訂", "停止自動回覆", "不要再傳"]);
const START_WORDS = new Set(["start", "subscribe", "開始", "恢復", "恢復訂閱"]);

export const OPT_OUT_CONFIRMATION =
  "已停止自動訊息，之後只有在你點選單或按鈕時才會回覆。想恢復請傳「開始」。\nAutomated messages are off; you'll only get a reply when you tap a menu item or button. Send START to turn them back on.";
export const OPT_IN_CONFIRMATION = "已恢復自動訊息。\nAutomated messages are back on.";

export function optOutCommand(text: string): "stop" | "start" | null {
  const normalized = text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}

// Keyed by the Instagram account id, not our row id, so an opt-out survives
// disconnecting and reconnecting the account.
export async function isOptedOut(instagramId: string, userId: string) {
  const row = await prisma.dmOptOut.findUnique({
    where: { instagramId_userId: { instagramId, userId } },
    select: { id: true },
  });
  return Boolean(row);
}

/** Record the choice. True when it changed something (START from someone opted in does not). */
export async function setOptOut(instagramId: string, userId: string, optedOut: boolean): Promise<boolean> {
  if (optedOut) {
    await prisma.dmOptOut.upsert({
      where: { instagramId_userId: { instagramId, userId } },
      create: { instagramId, userId },
      update: {},
    });
    return true;
  }
  const removed = await prisma.dmOptOut.deleteMany({ where: { instagramId, userId } });
  return removed.count > 0;
}
