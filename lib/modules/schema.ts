import { randomBytes } from "node:crypto";
import { z } from "zod";

// Instagram's generic template limits.
export const MAX_CARDS = 10;
export const MAX_CARD_BUTTONS = 3;
export const CARD_TITLE_MAX = 80;
export const CARD_SUBTITLE_MAX = 80;
export const BUTTON_LABEL_MAX = 20;
export const MAX_QUICK_REPLIES = 13;
export const QUICK_REPLY_TITLE_MAX = 20;

export const DEFAULT_UTM_SOURCE = "openreply";
export const DEFAULT_UTM_MEDIUM = "dm";

/** A card button opens a link (url) or answers with another module (moduleId). */
export interface ModuleButton {
  label: string;
  url: string | null;
  moduleId: string | null;
}

/** A chip under the reply; tapping it sends another module. */
export interface ModuleQuickReply {
  title: string;
  moduleId: string;
}

export interface ModuleCard {
  /** Stable id, so a card keeps its tracked links when cards are reordered. */
  id?: string;
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

const moduleRef = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{10,40}$/i, { message: "Invalid module" })
  .optional()
  .nullable()
  .transform((value) => value || null);

export const moduleButtonSchema = z
  .object({
    label: z.string().trim().min(1).max(BUTTON_LABEL_MAX),
    url: optionalHttpsUrl,
    moduleId: moduleRef,
  })
  .refine((button) => Boolean(button.url) !== Boolean(button.moduleId), {
    message: "A button either opens a link or sends a module",
  });

export const moduleQuickReplySchema = z.object({
  title: z.string().trim().min(1).max(QUICK_REPLY_TITLE_MAX),
  moduleId: z.string().trim().regex(/^[a-z0-9]{10,40}$/i, { message: "Invalid module" }),
});

export const moduleCardSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{6,32}$/i).optional(),
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
  cards: z.array(moduleCardSchema).min(1).max(MAX_CARDS).transform((cards) => ensureCardIds(cards)),
  quickReplies: z.array(moduleQuickReplySchema).max(MAX_QUICK_REPLIES).default([]),
  quickReplyPrompt: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((value) => value || null),
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

/** Give every card an id, and a fresh one to a copy that repeats another's. */
export function ensureCardIds(cards: ModuleCard[]): ModuleCard[] {
  const seen = new Set<string>();
  return cards.map((card) => {
    let id = card.id;
    if (!id || seen.has(id)) id = randomBytes(6).toString("hex");
    seen.add(id);
    return { ...card, id };
  });
}

/** The key a card's tracked links hang on: its id, or its position before ids existed. */
export function cardKeyOf(card: ModuleCard, index: number): string {
  return card.id ?? `pos${index + 1}`;
}

/**
 * The tracked slots a card has: its image link, then each link button by its
 * position (a module button has no link to track, but keeps its number so the
 * other buttons' slots never shift).
 */
export function cardSlots(card: ModuleCard): { slot: ModuleSlot; url: string }[] {
  const slots: { slot: ModuleSlot; url: string }[] = [];
  if (card.imageLinkUrl) slots.push({ slot: "img", url: card.imageLinkUrl });
  card.buttons.slice(0, MAX_CARD_BUTTONS).forEach((button, index) => {
    if (button.url) slots.push({ slot: `btn${index + 1}` as ModuleSlot, url: button.url });
  });
  return slots;
}

/** Stored quick replies; invalid entries are dropped. */
export function parseStoredQuickReplies(value: unknown): ModuleQuickReply[] {
  if (!Array.isArray(value)) return [];
  const replies: ModuleQuickReply[] = [];
  for (const raw of value.slice(0, MAX_QUICK_REPLIES)) {
    const parsed = moduleQuickReplySchema.safeParse(raw);
    if (parsed.success) replies.push(parsed.data);
  }
  return replies;
}

/** Every module a module points at, through its buttons and quick replies. */
export function referencedModuleIds(input: {
  cards: ModuleCard[];
  quickReplies: ModuleQuickReply[];
}): string[] {
  const ids = new Set<string>();
  for (const card of input.cards) {
    for (const button of card.buttons) if (button.moduleId) ids.add(button.moduleId);
  }
  for (const reply of input.quickReplies) ids.add(reply.moduleId);
  return [...ids];
}

/** Payload of a button or quick reply that answers with a module. */
export function moduleActionPayload(moduleId: string, automationId: string | undefined) {
  return `mod:${moduleId}:${automationId || "-"}`;
}

/** Parse `mod:<moduleId>:<automationId>` / `rule:<automationId>`; null if malformed. */
export function parseDmActionPayload(
  payload: string
): { type: "module"; moduleId: string; automationId: string | null } | { type: "rule"; automationId: string } | null {
  const id = /^[a-z0-9]{10,40}$/i;
  const parts = payload.split(":");
  if (parts[0] === "mod" && parts.length === 3 && id.test(parts[1])) {
    return { type: "module", moduleId: parts[1], automationId: id.test(parts[2]) ? parts[2] : null };
  }
  if (parts[0] === "rule" && parts.length === 2 && id.test(parts[1])) {
    return { type: "rule", automationId: parts[1] };
  }
  return null;
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
