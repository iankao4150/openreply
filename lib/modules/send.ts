import { getBaseUrl } from "@/lib/env";
import {
  CardsUnsupportedError,
  MetaApiError,
  RateLimitError,
  TokenExpiredError,
  sendDirectMessage,
  sendDirectMessageWithCards,
  sendDirectMessageWithLinkButton,
  sendDirectMessageWithQuickReplies,
  sendPrivateReply,
  sendPrivateReplyWithCards,
  sendPrivateReplyWithLinkButton,
  type InstagramContext,
} from "@/lib/instagram/provider";
import { renderMessageWithoutLink } from "@/lib/tracking/message";
import { hashRecipientId } from "@/lib/tracking/server";
import {
  buildCardElements,
  buildCardsPlainText,
  buildFirstCardButtons,
  buildQuickReplies,
  type RenderContext,
  type SentModuleLink,
} from "./render";
import { parseStoredCards, parseStoredQuickReplies } from "./schema";

/** What the worker loads with a campaign to send its module. */
export interface SendableModule {
  id: string;
  introText: string | null;
  cards: unknown;
  quickReplies?: unknown;
  quickReplyPrompt?: string | null;
  links: SentModuleLink[];
}

const DEFAULT_QUICK_REPLY_PROMPT = "👇";

export type ModuleDelivery = "cards" | "button" | "text";

// Refusals no other format can get past: the conversation, not the template,
// was rejected. Retrying would burn the comment's single private reply on a
// misleading error.
const CONVERSATION_REJECTIONS = [
  /outside of allowed window/i,
  /invalid for a private reply/i,
  /requested user cannot be found/i,
  /not the thread owner/i,
];

/**
 * True when the carousel itself was refused (an invalid-parameter error) or the
 * connection cannot send one, so a simpler format is worth trying.
 */
export function isCardsRejection(error: unknown): boolean {
  if (error instanceof CardsUnsupportedError) return true;
  if (error instanceof TokenExpiredError || error instanceof RateLimitError) return false;
  return (
    error instanceof MetaApiError &&
    /\[code=100 /.test(error.message) &&
    !CONVERSATION_REJECTIONS.some((pattern) => pattern.test(error.message))
  );
}

function renderContext(
  automationId: string,
  recipientId: string,
  commenterName: string | null | undefined
): RenderContext {
  return {
    baseUrl: getBaseUrl(),
    automationId,
    recipientToken: hashRecipientId(recipientId),
    commenterName,
  };
}

/**
 * Answer a comment with the module's cards as its single private reply. Falls
 * back to the first card as a button message, then to plain text, when Meta
 * refuses the richer format. The intro text is not sent here: a private reply
 * is exactly one message.
 */
export async function sendModuleAsPrivateReply({
  context,
  instagramAccountId,
  commentId,
  postId,
  module,
  automationId,
  commenterId,
  commenterName,
  fallbackText,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  postId?: string;
  module: SendableModule;
  automationId: string;
  commenterId: string;
  commenterName?: string | null;
  fallbackText: string;
}): Promise<ModuleDelivery> {
  const cards = parseStoredCards(module.cards);
  const ctx = renderContext(automationId, commenterId, commenterName);
  const plain = () =>
    buildCardsPlainText(cards, module.links, ctx) ||
    renderMessageWithoutLink({ message: fallbackText, commenterName });

  if (cards.length > 0) {
    try {
      await sendPrivateReplyWithCards({
        context,
        instagramAccountId,
        commentId,
        elements: buildCardElements(cards, module.links, ctx),
      });
      return "cards";
    } catch (error) {
      if (!isCardsRejection(error)) throw error;
      console.log("[Modules] Carousel refused for a private reply, falling back:", String(error));
    }

    const first = buildFirstCardButtons(cards, module.links, ctx);
    if (first) {
      try {
        await sendPrivateReplyWithLinkButton({
          context,
          instagramAccountId,
          commentId,
          text: first.text,
          buttons: first.buttons,
          postId,
        });
        return "button";
      } catch (error) {
        if (!isCardsRejection(error)) throw error;
      }
    }
  }

  await sendPrivateReply({ context, instagramAccountId, commentId, message: plain(), postId });
  return "text";
}

/**
 * Send the module into an open conversation (a DM trigger or a button tap):
 * the intro text first, then the cards, with the same fallbacks.
 */
export async function sendModuleAsDirectMessage({
  context,
  instagramAccountId,
  userId,
  module,
  automationId,
  commenterName,
  fallbackText,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  module: SendableModule;
  automationId: string;
  commenterName?: string | null;
  fallbackText: string;
}): Promise<ModuleDelivery> {
  const delivery = await sendModuleBody({
    context,
    instagramAccountId,
    userId,
    module,
    automationId,
    commenterName,
    fallbackText,
  });

  // Quick replies ride on a short message of their own after the cards, so
  // they work whichever format the cards went out in.
  const replies = parseStoredQuickReplies(module.quickReplies);
  if (replies.length > 0) {
    try {
      await sendDirectMessageWithQuickReplies({
        context,
        instagramAccountId,
        userId,
        text: renderMessageWithoutLink({
          message: module.quickReplyPrompt || DEFAULT_QUICK_REPLY_PROMPT,
          commenterName,
        }),
        quickReplies: buildQuickReplies(replies, renderContext(automationId, userId, commenterName)),
      });
    } catch (error) {
      // The cards already went out; missing chips must not fail the reply.
      console.warn("[Modules] Quick replies not sent:", String(error));
    }
  }
  return delivery;
}

async function sendModuleBody({
  context,
  instagramAccountId,
  userId,
  module,
  automationId,
  commenterName,
  fallbackText,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  module: SendableModule;
  automationId: string;
  commenterName?: string | null;
  fallbackText: string;
}): Promise<ModuleDelivery> {
  const cards = parseStoredCards(module.cards);
  const ctx = renderContext(automationId, userId, commenterName);

  if (module.introText) {
    await sendDirectMessage({
      context,
      instagramAccountId,
      userId,
      message: renderMessageWithoutLink({ message: module.introText, commenterName }),
    });
  }

  if (cards.length > 0) {
    try {
      await sendDirectMessageWithCards({
        context,
        instagramAccountId,
        userId,
        elements: buildCardElements(cards, module.links, ctx),
      });
      return "cards";
    } catch (error) {
      if (!isCardsRejection(error)) throw error;
      console.log("[Modules] Carousel refused in a DM, falling back:", String(error));
    }

    const first = buildFirstCardButtons(cards, module.links, ctx);
    if (first) {
      try {
        await sendDirectMessageWithLinkButton({
          context,
          instagramAccountId,
          userId,
          text: first.text,
          buttons: first.buttons,
        });
        return "button";
      } catch (error) {
        if (!isCardsRejection(error)) throw error;
      }
    }
  }

  // The intro already went out, so the plain fallback repeats only the cards.
  await sendDirectMessage({
    context,
    instagramAccountId,
    userId,
    message:
      buildCardsPlainText(cards, module.links, ctx) ||
      renderMessageWithoutLink({ message: fallbackText, commenterName }),
  });
  return "text";
}
