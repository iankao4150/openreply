import type { Prisma } from "@/app/generated/prisma/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  cardKeyOf,
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
  cardKey: string;
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
      cardKey: cardKeyOf(card, index),
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
 * Make a module's tracked links match its cards. Links follow the card (by its
 * id), so reordering keeps each card's slug and click history, and editing a
 * URL also fixes the link in DMs already sent. A removed card or button
 * retires its link: it still redirects for messages already out, but is not
 * used again.
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
    where: { moduleId, retiredAt: null },
    select: { id: true, card: true, cardKey: true, slot: true, destinationUrl: true },
  });

  // Links from before cards had ids belong to the card now at their position.
  const keyAtPosition = new Map(cards.map((card, index) => [index + 1, cardKeyOf(card, index)]));
  for (const link of existing) {
    if (link.cardKey && !link.cardKey.startsWith("pos")) continue;
    const adopted = keyAtPosition.get(link.card) ?? null;
    if (adopted && adopted !== link.cardKey) {
      await tx.moduleLink.update({ where: { id: link.id }, data: { cardKey: adopted } });
      link.cardKey = adopted;
    }
  }

  const key = (cardKey: string | null, slot: string) => `${cardKey}:${slot}`;
  const existingByKey = new Map(existing.map((link) => [key(link.cardKey, link.slot), link]));
  const wanted = new Set(desired.map((link) => key(link.cardKey, link.slot)));

  const stale = existing.filter((link) => !wanted.has(key(link.cardKey, link.slot)));
  if (stale.length > 0) {
    await tx.moduleLink.updateMany({
      where: { id: { in: stale.map((link) => link.id) } },
      data: { retiredAt: new Date() },
    });
  }

  for (const link of desired) {
    const current = existingByKey.get(key(link.cardKey, link.slot));
    if (!current) {
      await tx.moduleLink.create({
        data: {
          workspaceId,
          moduleId,
          slug: generateTrackedLinkSlug(),
          card: link.card,
          cardKey: link.cardKey,
          slot: link.slot,
          destinationUrl: link.destinationUrl,
        },
      });
    } else if (current.destinationUrl !== link.destinationUrl || current.card !== link.card) {
      await tx.moduleLink.update({
        where: { id: current.id },
        data: { destinationUrl: link.destinationUrl, card: link.card },
      });
    }
  }
}
