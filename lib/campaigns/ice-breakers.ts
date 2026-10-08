import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  deleteInstagramIceBreakers,
  deleteInstagramPersistentMenu,
  setInstagramIceBreakers,
} from "@/lib/meta/client";

export const MAX_ICE_BREAKERS = 4;

/**
 * Publish an account's active ice-breaker rules to Instagram (oldest four), or
 * clear them when none are left. Returns an error message instead of throwing,
 * so a Meta hiccup never fails the save that triggered it; the failure is
 * recorded as an operational event.
 */
export async function syncIceBreakers(instagramAccountDbId: string): Promise<string | null> {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: instagramAccountDbId },
    select: { id: true, workspaceId: true, provider: true, accessToken: true },
  });
  // Zernio manages its own connection; ice breakers are a direct-Meta feature.
  if (!account || account.provider !== "META" || !account.accessToken) return null;

  const rules = await prisma.automation.findMany({
    where: {
      instagramAccountId: account.id,
      dmOnly: true,
      dmRuleType: "ICE_BREAKER",
      isActive: true,
      iceBreakerQuestion: { not: null },
    },
    select: { id: true, iceBreakerQuestion: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ICE_BREAKERS,
  });

  try {
    const token = decryptToken(account.accessToken);
    if (rules.length === 0) await deleteInstagramIceBreakers(token);
    else
      await setInstagramIceBreakers(
        token,
        rules.map((rule) => ({ question: rule.iceBreakerQuestion as string, payload: `rule:${rule.id}` }))
      );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "SYSTEM",
          level: "ERROR",
          message: "Ice breakers could not be published to Instagram",
          payload: { reason: message.slice(0, 500) },
        },
      })
      .catch(() => {});
    return message;
  }
}

/**
 * Before an account is disconnected: take its ice breakers and DM menu off
 * Instagram, since nothing will answer them anymore. Best effort.
 */
export async function clearMessengerProfile(account: {
  provider: string;
  accessToken: string | null;
  persistentMenu: unknown;
  automations: { id: string }[];
}): Promise<void> {
  if (account.provider !== "META" || !account.accessToken) return;
  const hasMenu = Array.isArray(account.persistentMenu) && account.persistentMenu.length > 0;
  if (!hasMenu && account.automations.length === 0) return;
  try {
    const token = decryptToken(account.accessToken);
    await Promise.allSettled([
      account.automations.length ? deleteInstagramIceBreakers(token) : null,
      hasMenu ? deleteInstagramPersistentMenu(token) : null,
    ]);
  } catch (error) {
    console.warn("[Ice breakers] Not cleared on disconnect:", String(error));
  }
}
