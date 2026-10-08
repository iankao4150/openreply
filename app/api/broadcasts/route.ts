import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { BROADCAST_JOB_NAME, getDMQueue } from "@/lib/queue/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { broadcastAudienceWhere, MAX_BROADCAST_RECIPIENTS } from "@/lib/broadcasts/send";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const createSchema = z.object({
  instagramAccountId: z.string().min(1).optional().nullable(),
  messageModuleId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  // true: only count who would get it, send nothing.
  preview: z.boolean().optional().default(false),
});

/** GET: recent broadcasts with their progress. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  const broadcasts = await prisma.broadcast.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      instagramAccount: { select: { username: true } },
      messageModule: { select: { id: true, name: true } },
      _count: { select: { deliveries: { where: { status: "PENDING" } } } },
    },
  });
  return NextResponse.json({
    success: true,
    data: broadcasts.map(({ _count, ...b }) => ({ ...b, pending: _count.deliveries })),
  });
}

/**
 * POST: send a module to the contacts whose 24-hour window is open (optionally
 * only those with a tag). With preview, returns the count and sends nothing.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  if (!canManageWorkspace(context.role)) return fail("Only owners and admins can send broadcasts", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid input", 400);
  const input = parsed.data;

  const account = await getWorkspaceInstagramAccount(context.workspaceId, input.instagramAccountId ?? null);
  if (!account) return fail("Instagram account not connected.", 400);
  const moduleRecord = await prisma.messageModule.findFirst({
    where: { id: input.messageModuleId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!moduleRecord) return fail("Module not found", 404);

  const audience = await prisma.contact.findMany({
    where: broadcastAudienceWhere({
      workspaceId: context.workspaceId,
      instagramAccountId: account.id,
      tags: input.tags,
      now: Date.now(),
    }),
    select: { userId: true },
    orderBy: { lastInboundAt: "asc" },
    take: MAX_BROADCAST_RECIPIENTS + 1,
  });
  // Opted-out people are left out up front (and checked again at send time).
  const optedOut = new Set(
    (
      await prisma.dmOptOut.findMany({
        where: { instagramId: account.instagramId, userId: { in: audience.map((c) => c.userId) } },
        select: { userId: true },
      })
    ).map((row) => row.userId)
  );
  const recipients = audience.filter((c) => !optedOut.has(c.userId)).slice(0, MAX_BROADCAST_RECIPIENTS);
  const capped = audience.length > MAX_BROADCAST_RECIPIENTS;

  if (input.preview) {
    return NextResponse.json({ success: true, data: { recipients: recipients.length, capped } });
  }
  if (recipients.length === 0) return fail("Nobody can be messaged right now", 400);

  const broadcast = await prisma.$transaction(async (tx) => {
    const created = await tx.broadcast.create({
      data: {
        workspaceId: context.workspaceId,
        instagramAccountId: account.id,
        messageModuleId: moduleRecord.id,
        name: input.name,
        tags: input.tags,
        recipients: recipients.length,
        createdById: context.userId ?? null,
      },
    });
    await tx.broadcastRecipient.createMany({
      data: recipients.map((r) => ({ broadcastId: created.id, userId: r.userId })),
      skipDuplicates: true,
    });
    return created;
  });

  await getDMQueue().add(
    BROADCAST_JOB_NAME,
    { broadcastId: broadcast.id, instagramAccountId: account.instagramId },
    { jobId: `broadcast_${broadcast.id}_start` }
  );

  return NextResponse.json({ success: true, data: { ...broadcast, capped } }, { status: 201 });
}

/** PATCH ?id= {cancel: true}: stop a broadcast; whoever already got it keeps it. */
export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  if (!canManageWorkspace(context.role)) return fail("Only owners and admins can cancel broadcasts", 403);
  const id = request.nextUrl.searchParams.get("id");
  const body = await request.json().catch(() => null);
  if (!id || body?.cancel !== true) return fail("Invalid input", 400);
  const updated = await prisma.broadcast.updateMany({
    where: { id, workspaceId: context.workspaceId, status: { in: ["QUEUED", "SENDING"] } },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) return fail("Broadcast not found or already finished", 404);
  return NextResponse.json({ success: true });
}
