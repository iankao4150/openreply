import { z } from "zod";

// Instagram's generic template limits.
export const MAX_CARDS = 10;
export const MAX_CARD_BUTTONS = 3;
export const CARD_TITLE_MAX = 80;
export const CARD_SUBTITLE_MAX = 80;
export const BUTTON_LABEL_MAX = 20;

export const DEFAULT_UTM_SOURCE = "openreply";
export const DEFAULT_UTM_MEDIUM = "dm";

export interface ModuleButton {
  label: string;
  url: string;
}

export interface ModuleCard {
  imageUrl: string | null;
  title: string;
  subtitle: string | null;
  /** Where tapping the card image goes. */
  imageLinkUrl: string | null;
  buttons: ModuleButton[];
}

export type ModuleSlot = "img" | "btn1" | "btn2" | "btn3";

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https:\/\//i.test(value), {
    message: "Links and images must start with https://",
  });

const optionalHttpsUrl = z
  .union([httpsUrl, z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const moduleButtonSchema = z.object({
  label: z.string().trim().min(1).max(BUTTON_LABEL_MAX),
  url: httpsUrl,
});

export const moduleCardSchema = z
  .object({
    imageUrl: optionalHttpsUrl,
    title: z.string().trim().min(1).max(CARD_TITLE_MAX),
    subtitle: z
      .string()
      .trim()
      .max(CARD_SUBTITLE_MAX)
      .optional()
      .nullable()
      .transform((value) => value || null),
    imageLinkUrl: optionalHttpsUrl,
    buttons: z.array(moduleButtonSchema).max(MAX_CARD_BUTTONS).default([]),
  })
  // Meta rejects a card that is a title and nothing else.
  .refine((card) => card.imageUrl || card.subtitle || card.buttons.length > 0, {
    message: "Each card needs an image, a description or a button besides its title",
  });

const utmValue = z.string().trim().max(100).optional().nullable();

export const moduleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  introText: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((value) => value || null),
  cards: z.array(moduleCardSchema).min(1).max(MAX_CARDS),
  utmSource: utmValue.transform((value) => value || DEFAULT_UTM_SOURCE),
  utmMedium: utmValue.transform((value) => value || DEFAULT_UTM_MEDIUM),
  utmCampaign: utmValue.transform((value) => value || null),
});

export type ModuleInput = z.infer<typeof moduleInputSchema>;

/**
 * Cards as stored in MessageModule.cards. Anything that no longer validates
 * (hand-edited JSON, an older shape) is dropped rather than sent to Meta.
 */
export function parseStoredCards(value: unknown): ModuleCard[] {
  if (!Array.isArray(value)) return [];
  const cards: ModuleCard[] = [];
  for (const raw of value.slice(0, MAX_CARDS)) {
    const parsed = moduleCardSchema.safeParse(raw);
    if (parsed.success) cards.push(parsed.data);
  }
  return cards;
}

/** The tracked slots a card has: its image link, then each button in order. */
export function cardSlots(card: ModuleCard): { slot: ModuleSlot; url: string }[] {
  const slots: { slot: ModuleSlot; url: string }[] = [];
  if (card.imageLinkUrl) slots.push({ slot: "img", url: card.imageLinkUrl });
  card.buttons.slice(0, MAX_CARD_BUTTONS).forEach((button, index) => {
    slots.push({ slot: `btn${index + 1}` as ModuleSlot, url: button.url });
  });
  return slots;
}

/**
 * utm_term for a slot, matching the existing DM tracking SOP: card 3's image is
 * c3img, its first button c3btn, further buttons c3btn2 / c3btn3.
 */
export function slotTerm(card: number, slot: ModuleSlot): string {
  if (slot === "img") return `c${card}img`;
  if (slot === "btn1") return `c${card}btn`;
  return `c${card}${slot}`;
}

/**
 * Add the module's UTM parameters to a destination. Parameters already on the
 * URL win, so a link someone tagged by hand is never overwritten.
 */
export function withUtm(
  url: string,
  utm: { source: string; medium: string; campaign: string | null; term: string }
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const add = (key: string, value: string | null) => {
    if (value && !parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  };
  add("utm_source", utm.source);
  add("utm_medium", utm.medium);
  add("utm_campaign", utm.campaign);
  add("utm_term", utm.term);
  return parsed.toString();
}
