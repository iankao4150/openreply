import type { Job } from "bullmq";
import { prisma } from "@/lib/db/client";
import { BROADCAST_JOB_NAME, getDMQueue, type ProcessBroadcastJob } from "@/lib/queue/client";
import { MESSAGING_WINDOW_MS } from "@/lib/contacts/record";
import { isOptedOut } from "@/lib/ops/opt-out";
import { isHumanHandling } from "@/lib/ops/human-pause";
import { sendModuleAsDirectMessage } from "@/lib/modules/send";
import { classifySendError, isConfirmedSendRejection } from "@/lib/instagram/delivery-errors";
import { createInstagramContext, hasInstagramCredentials } from "@/lib/instagram/provider";
import { releaseWorkspaceDMReservation, reserveWorkspaceDMSend } from "@/lib/billing/usage";

/**
 * Broadcasts reach only people whose 24-hour messaging window is open: Meta
 * allows any message there, promotions included, and nothing outside it
 * without a message tag (which automation may not use). The window is checked
 * again right before each send, with a margin so a send never lands late.
 */
export const BROADCAST_BATCH = 25;
export const MAX_BROADCAST_RECIPIENTS = 5_000;
const WINDOW_MARGIN_MS = 10 * 60 * 1000;
const PAUSE_BETWEEN_SENDS_MS = Number(process.env.BROADCAST_PAUSE_MS ?? 300);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Contacts a broadcast would reach now. */
export function broadcastAudienceWhere(input: {
  workspaceId: string;
  instagramAccountId: string;
  tags: string[];
  now: number;
}) {
  return {
    workspaceId: input.workspaceId,
    instagramAccountId: input.instagramAccountId,
    lastInboundAt: { gt: new Date(input.now - MESSAGING_WINDOW_MS + WINDOW_MARGIN_MS) },
    ...(input.tags.length ? { tags: { hasSome: input.tags } } : {}),
  };
}

export function windowStillOpen(lastInboundAt: Date | null, now: number) {
  return Boolean(lastInboundAt && now - lastInboundAt.getTime() < MESSAGING_WINDOW_MS - WINDOW_MARGIN_MS);
}

async function finish(broadcastId: string) {
  const counts = await prisma.broadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { _all: true },
  });
  const count = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      sent: count("SENT"),
      failed: count("FAILED") + count("SENDING"),
      skipped: count("SKIPPED"),
    },
  });
  return { pending: count("PENDING") };
}

/** Whoever had not been sent to yet is skipped; the counts are final. */
async function settleCancelled(broadcastId: string) {
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: "PENDING" },
    data: { status: "SKIPPED", error: "Broadcast cancelled" },
  });
  await finish(broadcastId);
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { finishedAt: new Date() } });
}

export async function processBroadcast(job: Job<ProcessBroadcastJob>): Promise<void> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: job.data.broadcastId },
    include: {
      instagramAccount: true,
      messageModule: {
        select: {
          id: true,
          name: true,
          introText: true,
          cards: true,
          quickReplies: true,
          quickReplyPrompt: true,
          links: { where: { retiredAt: null }, select: { slug: true, card: true, cardKey: true, slot: true } },
        },
      },
    },
  });
  if (!broadcast || broadcast.status === "DONE") return;
  if (broadcast.status === "CANCELLED") {
    await settleCancelled(broadcast.id);
    return;
  }

  const account = broadcast.instagramAccount;
  const moduleRecord = broadcast.messageModule;
  if (!moduleRecord || !hasInstagramCredentials(account)) {
    await prisma.broadcastRecipient.updateMany({
      where: { broadcastId: broadcast.id, status: "PENDING" },
      data: { status: "SKIPPED", error: moduleRecord ? "No Instagram access" : "The module was deleted" },
    });
    await finish(broadcast.id);
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "DONE", finishedAt: new Date() } });
    return;
  }
  if (broadcast.status === "QUEUED") {
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "SENDING", startedAt: new Date() } });
  }

  const context = await createInstagramContext(account, `broadcast:${broadcast.id}`);
  const batch = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, status: "PENDING" },
    orderBy: { id: "asc" },
    take: BROADCAST_BATCH,
  });

  for (const recipient of batch) {
    // Cancelled from the dashboard: stop between sends.
    const current = await prisma.broadcast.findUnique({ where: { id: broadcast.id }, select: { status: true } });
    if (current?.status === "CANCELLED") break;

    // Claim the person first, so a retried or concurrent job never sends twice.
    const claimed = await prisma.broadcastRecipient.updateMany({
      where: { id: recipient.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) continue;

    const skip = async (reason: string) =>
      prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "SKIPPED", error: reason } });

    const contact = await prisma.contact.findUnique({
      where: { instagramAccountId_userId: { instagramAccountId: account.id, userId: recipient.userId } },
      select: { lastInboundAt: true, username: true },
    });
    const now = Date.now();
    if (!windowStillOpen(contact?.lastInboundAt ?? null, now)) {
      await skip("The 24-hour messaging window closed");
      continue;
    }
    if (await isOptedOut(account.instagramId, recipient.userId)) {
      await skip("Opted out of automated messages");
      continue;
    }
    if (await isHumanHandling(account.instagramId, recipient.userId)) {
      await skip("A person is handling this conversation");
      continue;
    }
    const usage = await reserveWorkspaceDMSend(broadcast.workspaceId);
    if (!usage.allowed) {
      await skip(`Monthly DM limit reached (${usage.limit})`);
      continue;
    }

    try {
      await sendModuleAsDirectMessage({
        context,
        instagramAccountId: account.instagramId,
        userId: recipient.userId,
        module: moduleRecord,
        automationId: "",
        commenterName: contact?.username ?? null,
        fallbackText: moduleRecord.name,
      });
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
    } catch (rawError) {
      const error = classifySendError(rawError);
      if (isConfirmedSendRejection(error)) {
        await releaseWorkspaceDMReservation(broadcast.workspaceId, usage.periodStart);
      }
      // Never retried: a refused send stays refused within the window, and an
      // uncertain one may already be in their inbox.
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", error: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      });
    }
    await sleep(PAUSE_BETWEEN_SENDS_MS);
  }

  const { pending } = await finish(broadcast.id);
  const latest = await prisma.broadcast.findUnique({ where: { id: broadcast.id }, select: { status: true } });
  if (latest?.status === "CANCELLED") {
    await settleCancelled(broadcast.id);
    return;
  }
  if (pending > 0) {
    await getDMQueue().add(
      BROADCAST_JOB_NAME,
      { broadcastId: broadcast.id, instagramAccountId: account.instagramId },
      { jobId: `broadcast_${broadcast.id}_${Date.now()}` }
    );
    return;
  }
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "DONE", finishedAt: new Date() } });
}
