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
  "已停止自動訊息，之後不會再收到自動回覆。想恢復請傳「開始」。\nYou won't get automated messages anymore. Send START to turn them back on.";
export const OPT_IN_CONFIRMATION = "已恢復自動訊息 👍\nAutomated messages are back on.";

export function optOutCommand(text: string): "stop" | "start" | null {
  const normalized = text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}

export async function isOptedOut(instagramAccountDbId: string, userId: string) {
  const row = await prisma.dmOptOut.findUnique({
    where: { instagramAccountId_userId: { instagramAccountId: instagramAccountDbId, userId } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function setOptOut(instagramAccountDbId: string, userId: string, optedOut: boolean) {
  if (optedOut) {
    await prisma.dmOptOut.upsert({
      where: { instagramAccountId_userId: { instagramAccountId: instagramAccountDbId, userId } },
      create: { instagramAccountId: instagramAccountDbId, userId },
      update: {},
    });
  } else {
    await prisma.dmOptOut.deleteMany({ where: { instagramAccountId: instagramAccountDbId, userId } });
  }
}
