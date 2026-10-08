import { prisma } from '@/lib/db/client';
import { DM_ACTION_JOB_NAME, getDMQueue, MESSAGE_JOB_NAME, POSTBACK_JOB_NAME } from '@/lib/queue/client';
import {
  isDmActionPayload,
  parseCommentEvents,
  parseEchoEvents,
  parseMessageEvents,
  parsePostbackEvents,
  parseQuickReplyEvents,
  parseReadEvents,
  parseStoryMentionEvents,
} from '@/lib/meta/webhook';
import { recordEcho } from '@/lib/ops/human-pause';
import { recordContacts, type ContactTouch } from '@/lib/contacts/record';

/** BullMQ job ids reject ":"; base64url keeps distinct mids distinct. */
const midKey = (mid: string) => Buffer.from(mid).toString('base64url');
import { Prisma, type InstagramProvider } from '@/app/generated/prisma/client';

const OPENING_DM_READ_FALLBACK_DELAY_MS = 5 * 60 * 1000;
type InstagramPayload = Parameters<typeof parseCommentEvents>[0];

export async function processInstagramWebhook({ payload: incoming, provider, workspaceId }: {
  payload: InstagramPayload; provider: InstagramProvider; workspaceId?: string;
}) {
  if (incoming.object !== 'instagram' || !Array.isArray(incoming.entry)) return;
  const accounts = await prisma.instagramAccount.findMany({
    where: { instagramId: { in: incoming.entry.map(e => e.id) }, provider, ...(workspaceId ? { workspaceId } : {}) },
    select: { id: true, instagramId: true, workspaceId: true, humanPauseMinutes: true },
  });
  const accountMap = new Map(accounts.map(a => [a.instagramId, a]));
  const allowed = new Set(accountMap.keys());
  const payload = { ...incoming, entry: incoming.entry.filter(e => allowed.has(e.id)) };
  if (!payload.entry.length) return;
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object:
        typeof payload === "object" && payload && "object" in payload
          ? String(payload.object)
          : null,
      payload: payload as unknown as Prisma.InputJsonValue,
      ...(workspaceId ? { workspaceId } : {}),
      status: "PENDING",
    },
  });

  try {
    const commentEvents = parseCommentEvents(
      payload as Parameters<typeof parseCommentEvents>[0]
    );
    const queue = getDMQueue();

    for (const event of commentEvents) {
      const account = accountMap.get(event.instagramAccountId);
      if (!account) continue;

      await queue.add(
        "process-comment",
        {
          instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          mediaId: event.mediaId,
          originalMediaId: event.originalMediaId,
          source: "WEBHOOK",
        },
        {
          jobId: `comment_${event.instagramAccountId}_${event.commentId}`,
        }
      );

      if (account) {
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { workspaceId: account.workspaceId },
        });
      }
    }

    // Button taps from opening DMs → deliver the reveal message.
    const postbackEvents = parsePostbackEvents(
      payload as Parameters<typeof parsePostbackEvents>[0]
    );

    for (const event of postbackEvents) {
      // Buttons that answer with a module or a DM rule (card buttons, ice
      // breakers) have their own handler.
      if (isDmActionPayload(event.payload)) {
        // Without a mid, the tap's own timestamp keeps redeliveries of this webhook
        // on the same job id (Date.now() would turn each into a new send).
        const mid = event.mid ?? `${event.userId}:${event.payload}:${event.timestamp ?? webhookEvent.id}`;
        await queue.add(
          DM_ACTION_JOB_NAME,
          {
            instagramAccountId: event.instagramAccountId,
            accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
            userId: event.userId,
            kind: 'tap',
            payload: event.payload,
            mid,
          },
          { jobId: `dmaction_${event.instagramAccountId}_${midKey(mid)}` }
        );
        continue;
      }
      await queue.add(
        POSTBACK_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
          userId: event.userId,
          payload: event.payload,
          mid: event.mid,
        },
        {
          // BullMQ forbids ":" in custom job ids, and the payload is
          // "reveal:<id>", so build with underscores and strip any colons.
          jobId: `postback_${event.instagramAccountId}_${event.userId}_${(
            event.mid ?? event.payload
          ).replace(/:/g, "_")}`,
        }
      );
    }

    // Quick-reply taps → the module or rule they point at.
    const quickReplyEvents = parseQuickReplyEvents(payload as Parameters<typeof parseQuickReplyEvents>[0]);
    for (const event of quickReplyEvents) {
      if (!accountMap.has(event.instagramAccountId)) continue;
      await queue.add(
        DM_ACTION_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
          userId: event.userId,
          kind: 'tap',
          payload: event.payload,
          mid: event.mid,
        },
        { jobId: `dmaction_${event.instagramAccountId}_${midKey(event.mid)}` }
      );
    }

    // Story mentions → the account's story-mention rule, if any.
    const storyMentionEvents = parseStoryMentionEvents(payload as Parameters<typeof parseStoryMentionEvents>[0]);
    for (const event of storyMentionEvents) {
      if (!accountMap.has(event.instagramAccountId)) continue;
      await queue.add(
        DM_ACTION_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
          userId: event.userId,
          kind: 'story',
          mid: event.mid,
        },
        { jobId: `dmaction_${event.instagramAccountId}_${midKey(event.mid)}` }
      );
    }

    // Echoes: a message the account sent by hand pauses automated DM replies.
    for (const event of parseEchoEvents(payload as Parameters<typeof parseEchoEvents>[0])) {
      const account = accountMap.get(event.instagramAccountId);
      if (!account) continue;
      await recordEcho(event.instagramAccountId, event.userId, account.humanPauseMinutes, event.mid).catch(
        (error) => console.warn('[Webhook] Echo not recorded:', String(error))
      );
    }

    // Inbound DMs → keyword-triggered autoreply.
    const messageEvents = parseMessageEvents(
      payload as Parameters<typeof parseMessageEvents>[0]
    );

    for (const event of messageEvents) {
      const account = accountMap.get(event.instagramAccountId);
      if (!account) continue;

      await queue.add(
        MESSAGE_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
          messageId: event.messageId,
          messageText: event.messageText,
          senderId: event.senderId,
        },
        {
          // Message ids can contain characters BullMQ rejects in a job id (":"
          // in particular). base64url encodes into exactly the allowed alphabet
          // and stays injective — substituting invalid characters would let two
          // distinct mids collapse onto one job id, silently dropping a reply.
          jobId: `message_${event.instagramAccountId}_${Buffer.from(
            event.messageId
          ).toString("base64url")}`,
        }
      );

      if (account) {
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { workspaceId: account.workspaceId },
        });
      }
    }

    // If a user reads the opening DM and never taps the button, deliver the
    // same next-step DM after five minutes. The worker no-ops this delayed job
    // if a real button tap has already delivered the reveal.
    const readEvents = parseReadEvents(
      payload as Parameters<typeof parseReadEvents>[0]
    );

    for (const event of readEvents) {
      const openingLogs = await prisma.dmLog.findMany({
        where: {
          commenterId: event.userId,
          status: "SENT",
          automation: {
            isActive: true,
            openingDmEnabled: true,
            instagramAccount: {
              instagramId: event.instagramAccountId,
            },
          },
        },
        select: {
          automation: {
            select: {
              id: true,
            },
          },
        },
      });

      const scheduledAutomationIds = new Set<string>();
      for (const log of openingLogs) {
        const automation = log.automation;
        if (scheduledAutomationIds.has(automation.id)) continue;
        scheduledAutomationIds.add(automation.id);

        await queue.add(
          POSTBACK_JOB_NAME,
          {
            instagramAccountId: event.instagramAccountId,
          accountConnectionId: accountMap.get(event.instagramAccountId)?.id,
            userId: event.userId,
            payload: `reveal:${automation.id}`,
            fallback: true,
          },
          {
            delay: OPENING_DM_READ_FALLBACK_DELAY_MS,
            jobId: `read_fallback_${event.instagramAccountId}_${event.userId}_${automation.id}`,
          }
        );
      }
    }

    // Contacts: who commented, and who messaged (which opens the 24-hour window).
    const touches: ContactTouch[] = [];
    const touch = (
      instagramId: string,
      userId: string,
      kind: ContactTouch['kind'],
      username?: string,
      timestamp?: number
    ) => {
      const account = accountMap.get(instagramId);
      if (!account || !userId || userId === instagramId) return;
      touches.push({
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        userId,
        username,
        kind,
        ...(timestamp ? { at: new Date(timestamp) } : {}),
      });
    };
    for (const e of commentEvents) touch(e.instagramAccountId, e.commenterId, 'comment', e.commenterName);
    for (const e of postbackEvents) touch(e.instagramAccountId, e.userId, 'inbound', undefined, e.timestamp);
    for (const e of quickReplyEvents) touch(e.instagramAccountId, e.userId, 'inbound', undefined, e.timestamp);
    for (const e of storyMentionEvents) touch(e.instagramAccountId, e.userId, 'inbound', undefined, e.timestamp);
    for (const e of messageEvents) touch(e.instagramAccountId, e.senderId, 'inbound', undefined, e.timestamp);
    await recordContacts(touches);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });

    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        processedAt: new Date(),
      },
    });

    throw error;
  }
}
