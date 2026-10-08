import type { Prisma } from "@/app/generated/prisma/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  cardSlots,
  slotTerm,
  withUtm,
  type ModuleCard,
  type ModuleSlot,
} from "./schema";

export interface ModuleUtm {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
}

export interface DesiredModuleLink {
  card: number;
  slot: ModuleSlot;
  destinationUrl: string;
}

/** Every tracked slot the cards need, with UTM parameters applied. */
export function desiredModuleLinks(
  cards: ModuleCard[],
  utm: ModuleUtm
): DesiredModuleLink[] {
  return cards.flatMap((card, index) =>
    cardSlots(card).map(({ slot, url }) => ({
      card: index + 1,
      slot,
      destinationUrl: withUtm(url, {
        source: utm.utmSource,
        medium: utm.utmMedium,
        campaign: utm.utmCampaign,
        term: slotTerm(index + 1, slot),
      }),
    }))
  );
}

/**
 * Make a module's tracked links match its cards. A slot keeps its slug (and so
 * its click history) across saves; only its destination is updated. Slots that
 * no longer exist are removed.
 */
export async function syncModuleLinks(
  tx: Prisma.TransactionClient,
  {
    workspaceId,
    moduleId,
    cards,
    utm,
  }: { workspaceId: string; moduleId: string; cards: ModuleCard[]; utm: ModuleUtm }
) {
  const desired = desiredModuleLinks(cards, utm);
  const existing = await tx.moduleLink.findMany({
    where: { moduleId },
    select: { id: true, card: true, slot: true, destinationUrl: true },
  });
  const key = (card: number, slot: string) => `${card}:${slot}`;
  const existingByKey = new Map(existing.map((link) => [key(link.card, link.slot), link]));
  const wanted = new Set(desired.map((link) => key(link.card, link.slot)));

  const stale = existing.filter((link) => !wanted.has(key(link.card, link.slot)));
  if (stale.length > 0) {
    await tx.moduleLink.deleteMany({ where: { id: { in: stale.map((link) => link.id) } } });
  }

  for (const link of desired) {
    const current = existingByKey.get(key(link.card, link.slot));
    if (!current) {
      await tx.moduleLink.create({
        data: {
          workspaceId,
          moduleId,
          slug: generateTrackedLinkSlug(),
          card: link.card,
          slot: link.slot,
          destinationUrl: link.destinationUrl,
        },
      });
    } else if (current.destinationUrl !== link.destinationUrl) {
      await tx.moduleLink.update({
        where: { id: current.id },
        data: { destinationUrl: link.destinationUrl },
      });
    }
  }
}
