import { createHash, randomUUID } from "node:crypto";
import * as meta from "@/lib/meta/client";
import {
  zernioRequest,
  ZernioApiError,
  ZernioDeliveryUnconfirmedError,
} from "@/lib/zernio/client";
import type { InstagramContext, ZernioContext } from "./context";
import { markAutomatedSend, rememberSentMid } from "@/lib/ops/human-pause";

type Button =
  | { type: "url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

async function sendZernioMessage({
  context,
  recipientId,
  commentId,
  postId,
  text,
  buttons,
}: {
  context: ZernioContext;
  recipientId?: string;
  commentId?: string;
  postId?: string;
  text: string;
  buttons?: Button[];
}) {
  const path = commentId
    ? `/inbox/comments/${encodeURIComponent(postId ?? commentId)}/${encodeURIComponent(commentId)}/private-reply`
    : `/inbox/conversations/${encodeURIComponent(recipientId!)}/messages`;
  const body = {
    accountId: context.accountId,
    message: buttons ? text.slice(0, 640) : text,
    ...(buttons ? { buttons } : {}),
  };
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        operationId: context.operationId ?? randomUUID(),
        path,
        body,
      })
    )
    .digest("hex");
  const result = await zernioRequest<{
    messageId?: string;
    data?: { messageId: string };
  }>({
    apiKey: context.apiKey,
    path,
    method: "POST",
    body,
    ...(commentId ? {} : { idempotencyKey }),
  }).catch((error: unknown) => {
    // A send may have succeeded upstream before a network/5xx failure. The
    // service releases idempotency claims on non-2xx, so do not auto-resend.
    if (error instanceof ZernioApiError && error.code >= 500)
      throw new ZernioDeliveryUnconfirmedError();
    throw error;
  });
  const messageId = result?.messageId ?? result?.data?.messageId;
  if (!messageId) throw new ZernioDeliveryUnconfirmedError();
  return {
    message_id: messageId,
    ...(recipientId ? { recipient_id: recipientId } : {}),
  };
}

function linkButtons(buttons: meta.LinkButton[]): Button[] {
  return buttons
    .slice(0, 3)
    .map(({ title, url }) => ({ type: "url", title: title.slice(0, 20), url }));
}

async function sendPrivateReplyUntracked({
  context,
  instagramAccountId,
  commentId,
  message,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  message: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReply(
      context.accessToken,
      instagramAccountId,
      commentId,
      message
    );
  return sendZernioMessage({ context, commentId, postId, text: message });
}

async function sendPrivateReplyWithButtonUntracked({
  context,
  instagramAccountId,
  commentId,
  text,
  buttonTitle,
  payload,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  text: string;
  buttonTitle: string;
  payload: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReplyWithButton(
      context.accessToken,
      instagramAccountId,
      commentId,
      text,
      buttonTitle,
      payload
    );
  return sendZernioMessage({
    context,
    commentId,
    postId,
    text: text,
    buttons: [{ type: "postback", title: buttonTitle.slice(0, 20), payload }],
  });
}

async function sendDirectMessageWithButtonUntracked({
  context,
  instagramAccountId,
  userId,
  text,
  buttonTitle,
  payload,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  text: string;
  buttonTitle: string;
  payload: string;
}) {
  if (context.provider === "META")
    return meta.sendDirectMessageWithButton(
      context.accessToken,
      instagramAccountId,
      userId,
      text,
      buttonTitle,
      payload
    );
  return sendZernioMessage({
    context,
    recipientId: userId,
    text: text,
    buttons: [{ type: "postback", title: buttonTitle.slice(0, 20), payload }],
  });
}

async function sendPrivateReplyWithLinkButtonUntracked({
  context,
  instagramAccountId,
  commentId,
  text,
  buttons,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  text: string;
  buttons: meta.LinkButton[];
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReplyWithLinkButton(
      context.accessToken,
      instagramAccountId,
      commentId,
      text,
      buttons
    );
  return sendZernioMessage({
    context,
    commentId,
    postId,
    text: text,
    buttons: linkButtons(buttons),
  });
}

async function sendDirectMessageUntracked({
  context,
  instagramAccountId,
  userId,
  message,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  message: string;
}) {
  if (context.provider === "META")
    return meta.sendDirectMessage(
      context.accessToken,
      instagramAccountId,
      userId,
      message
    );
  return sendZernioMessage({ context, recipientId: userId, text: message });
}

async function sendDirectMessageWithLinkButtonUntracked({
  context,
  instagramAccountId,
  userId,
  text,
  buttons,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  text: string;
  buttons: meta.LinkButton[];
}) {
  if (context.provider === "META")
    return meta.sendDirectMessageWithLinkButton(
      context.accessToken,
      instagramAccountId,
      userId,
      text,
      buttons
    );
  return sendZernioMessage({
    context,
    recipientId: userId,
    text: text,
    buttons: linkButtons(buttons),
  });
}

export async function sendCommentReply({
  context,
  commentId,
  message,
  postId,
}: {
  context: InstagramContext;
  commentId: string;
  message: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendCommentReply(context.accessToken, commentId, message);
  const result = await zernioRequest<{ data: { commentId: string } }>({
    apiKey: context.apiKey,
    path: `/inbox/comments/${encodeURIComponent(postId ?? commentId)}`,
    method: "POST",
    body: { accountId: context.accountId, commentId, message },
  }).catch((error: unknown) => {
    if (error instanceof ZernioApiError && error.code >= 500) throw new ZernioDeliveryUnconfirmedError();
    throw error;
  });
  if (!result?.data?.commentId) throw new ZernioDeliveryUnconfirmedError();
  return { id: result.data.commentId };
}

/**
 * Zernio's message API has no generic template. Thrown so the caller falls back
 * to a button template or plain text instead of failing the send.
 */
export class CardsUnsupportedError extends Error {
  constructor() {
    super("This connection cannot send carousel cards");
    this.name = "CardsUnsupportedError";
  }
}

async function sendPrivateReplyWithCardsUntracked({
  context,
  instagramAccountId,
  commentId,
  elements,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  elements: meta.GenericTemplateElement[];
}) {
  if (context.provider !== "META") throw new CardsUnsupportedError();
  return meta.sendPrivateReplyWithCards(context.accessToken, instagramAccountId, commentId, elements);
}

async function sendDirectMessageWithCardsUntracked({
  context,
  instagramAccountId,
  userId,
  elements,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  elements: meta.GenericTemplateElement[];
}) {
  if (context.provider !== "META") throw new CardsUnsupportedError();
  return meta.sendDirectMessageWithCards(context.accessToken, instagramAccountId, userId, elements);
}

async function sendDirectMessageWithQuickRepliesUntracked({
  context,
  instagramAccountId,
  userId,
  text,
  quickReplies,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  text: string;
  quickReplies: { content_type: "text"; title: string; payload: string }[];
}) {
  if (context.provider !== "META") throw new CardsUnsupportedError();
  return meta.sendDirectMessageWithQuickReplies(
    context.accessToken,
    instagramAccountId,
    userId,
    text,
    quickReplies
  );
}

/** Hide a comment. Zernio connections cannot, so this reports false there. */
export async function hideComment({
  context,
  commentId,
}: {
  context: InstagramContext;
  commentId: string;
}): Promise<boolean> {
  if (context.provider !== "META") return false;
  const result = await meta.hideComment(context.accessToken, commentId);
  return Boolean(result.success);
}

/**
 * Who a message comes from. Automated sends are remembered (by message id) so
 * their echoes are not mistaken for a person replying by hand; the inbox sends
 * as "human", and its echo pauses the automation like any manual reply.
 */
export type SendOrigin = "automation" | "human";

async function track<T>(
  args: { instagramAccountId: string; userId?: string; origin?: SendOrigin },
  send: () => Promise<T>
): Promise<T> {
  if (args.origin === "human") return send();
  if (args.userId) await markAutomatedSend(args.instagramAccountId, args.userId);
  const result = await send();
  const mid = (result as { message_id?: unknown } | null)?.message_id;
  if (typeof mid === "string" && mid) await rememberSentMid(mid);
  return result;
}

export async function sendPrivateReply(args: Parameters<typeof sendPrivateReplyUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendPrivateReplyUntracked(args));
}

export async function sendPrivateReplyWithButton(args: Parameters<typeof sendPrivateReplyWithButtonUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendPrivateReplyWithButtonUntracked(args));
}

export async function sendDirectMessageWithButton(args: Parameters<typeof sendDirectMessageWithButtonUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendDirectMessageWithButtonUntracked(args));
}

export async function sendPrivateReplyWithLinkButton(args: Parameters<typeof sendPrivateReplyWithLinkButtonUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendPrivateReplyWithLinkButtonUntracked(args));
}

export async function sendDirectMessage(args: Parameters<typeof sendDirectMessageUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendDirectMessageUntracked(args));
}

export async function sendDirectMessageWithLinkButton(args: Parameters<typeof sendDirectMessageWithLinkButtonUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendDirectMessageWithLinkButtonUntracked(args));
}

export async function sendPrivateReplyWithCards(args: Parameters<typeof sendPrivateReplyWithCardsUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendPrivateReplyWithCardsUntracked(args));
}

export async function sendDirectMessageWithCards(args: Parameters<typeof sendDirectMessageWithCardsUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendDirectMessageWithCardsUntracked(args));
}

export async function sendDirectMessageWithQuickReplies(args: Parameters<typeof sendDirectMessageWithQuickRepliesUntracked>[0] & { origin?: SendOrigin }) {
  return track(args, () => sendDirectMessageWithQuickRepliesUntracked(args));
}
