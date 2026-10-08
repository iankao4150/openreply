import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { deleteInstagramIceBreakers, setInstagramIceBreakers } from "@/lib/meta/client";

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
