import { renderMessageWithoutLink } from "@/lib/tracking/message";
import {
  CARD_SUBTITLE_MAX,
  CARD_TITLE_MAX,
  MAX_CARDS,
  moduleActionPayload,
  type ModuleCard,
  type ModuleQuickReply,
  type ModuleSlot,
} from "./schema";

/** A tracked link as loaded with the module. */
export interface SentModuleLink {
  slug: string;
  card: number;
  slot: string;
}

export type CardButton =
  | { type: "web_url"; url: string; title: string }
  | { type: "postback"; payload: string; title: string };

export interface CardElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  default_action?: { type: "web_url"; url: string };
  buttons?: CardButton[];
}

export interface QuickReplyOption {
  content_type: "text";
  title: string;
  payload: string;
}

export interface RenderContext {
  baseUrl: string;
  /** The campaign or DM rule sending the cards, so clicks can be attributed. */
  automationId?: string;
  recipientToken?: string;
  commenterName?: string | null;
}

export function moduleLinkUrl(slug: string, context: RenderContext): string {
  const url = new URL(`${context.baseUrl.replace(/\/$/, "")}/m/${slug}`);
  if (context.automationId) url.searchParams.set("a", context.automationId);
  if (context.recipientToken) url.searchParams.set("r", context.recipientToken);
  return url.toString();
}

function personalize(text: string, context: RenderContext): string {
  return renderMessageWithoutLink({ message: text, commenterName: context.commenterName });
}

/**
 * Resolve a card slot to the URL that goes in the message: the tracked
 * redirect when the slot has a link record, otherwise the raw destination (a
 * module saved before its links were synced still sends working links).
 */
function slotUrl(
  links: SentModuleLink[],
  card: number,
  slot: ModuleSlot,
  fallback: string,
  context: RenderContext
): string {
  const link = links.find((l) => l.card === card && l.slot === slot);
  return link ? moduleLinkUrl(link.slug, context) : fallback;
}

/** The module's cards as Instagram generic template elements. */
export function buildCardElements(
  cards: ModuleCard[],
  links: SentModuleLink[],
  context: RenderContext
): CardElement[] {
  return cards.slice(0, MAX_CARDS).map((card, index) => {
    const number = index + 1;
    const element: CardElement = {
      title: personalize(card.title, context).slice(0, CARD_TITLE_MAX),
    };
    if (card.subtitle) {
      element.subtitle = personalize(card.subtitle, context).slice(0, CARD_SUBTITLE_MAX);
    }
    if (card.imageUrl) element.image_url = card.imageUrl;
    if (card.imageLinkUrl) {
      element.default_action = {
        type: "web_url",
        url: slotUrl(links, number, "img", card.imageLinkUrl, context),
      };
    }
    if (card.buttons.length > 0) {
      element.buttons = card.buttons.slice(0, 3).map((button, buttonIndex): CardButton => {
        const title = button.label.slice(0, 20);
        // A module button answers with another module when tapped.
        if (button.moduleId) {
          return { type: "postback", title, payload: moduleActionPayload(button.moduleId, context.automationId) };
        }
        return {
          type: "web_url",
          title,
          url: slotUrl(links, number, `btn${buttonIndex + 1}` as ModuleSlot, button.url ?? "", context),
        };
      });
    }
    return element;
  });
}

/**
 * Fallback when Meta refuses the carousel: the first card as a button template
 * (text + up to 3 link buttons). Null when the first card has no link at all.
 */
export function buildFirstCardButtons(
  cards: ModuleCard[],
  links: SentModuleLink[],
  context: RenderContext
): { text: string; buttons: { title: string; url: string }[] } | null {
  const [element] = buildCardElements(cards.slice(0, 1), links, context);
  if (!element) return null;
  // The fallback is a link-button message, so only link buttons carry over.
  const buttons = (element.buttons ?? []).flatMap((b) =>
    b.type === "web_url" ? [{ title: b.title, url: b.url }] : []
  );
  if (buttons.length === 0 && element.default_action) {
    buttons.push({ title: "Open", url: element.default_action.url });
  }
  if (buttons.length === 0) return null;
  const text = [element.title, element.subtitle].filter(Boolean).join("\n").slice(0, 640);
  return { text, buttons };
}

/**
 * Last-resort plain text: every card's title with its first link underneath,
 * so the recipient still gets every product even without templates.
 */
export function buildCardsPlainText(
  cards: ModuleCard[],
  links: SentModuleLink[],
  context: RenderContext,
  intro?: string | null
): string {
  const elements = buildCardElements(cards, links, context);
  const lines: string[] = [];
  if (intro) lines.push(personalize(intro, context));
  for (const element of elements) {
    const firstLink = element.buttons?.find((b) => b.type === "web_url");
    const url = (firstLink?.type === "web_url" ? firstLink.url : undefined) ?? element.default_action?.url;
    lines.push(url ? `${element.title}\n${url}` : element.title);
  }
  return lines.join("\n\n").slice(0, 1000);
}

/** The module's quick replies as Instagram quick_replies options. */
export function buildQuickReplies(
  replies: ModuleQuickReply[],
  context: RenderContext
): QuickReplyOption[] {
  return replies.slice(0, 13).map((reply) => ({
    content_type: "text",
    title: reply.title.slice(0, 20),
    payload: moduleActionPayload(reply.moduleId, context.automationId),
  }));
}
