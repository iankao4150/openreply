export interface SlotClicks {
  card: number;
  slot: string;
  destinationUrl: string;
  /** Every tap, including repeats. */
  clicks: number;
  /** Distinct people, by recipient token, falling back to IP. */
  uniqueClicks: number;
}

/**
 * Click counts per card slot, in card order (image before buttons). A tap
 * without a recipient token or IP still counts as a click but cannot be
 * deduplicated, so it counts as its own unique click.
 */
export function summarizeModuleClicks(
  links: { id: string; card: number; slot: string; destinationUrl: string }[],
  clicks: { moduleLinkId: string; recipientHash: string | null; ipHash: string | null }[]
): SlotClicks[] {
  const slotOrder = (slot: string) => (slot === "img" ? 0 : Number(slot.replace("btn", "")) || 9);
  return [...links]
    .sort((a, b) => a.card - b.card || slotOrder(a.slot) - slotOrder(b.slot))
    .map((link) => {
      const own = clicks.filter((click) => click.moduleLinkId === link.id);
      const seen = new Set<string>();
      let anonymous = 0;
      for (const click of own) {
        const who = click.recipientHash ?? click.ipHash;
        if (who) seen.add(who);
        else anonymous++;
      }
      return {
        card: link.card,
        slot: link.slot,
        destinationUrl: link.destinationUrl,
        clicks: own.length,
        uniqueClicks: seen.size + anonymous,
      };
    });
}
