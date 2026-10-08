import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext, getRecentMediaComments, MetaApiError } from "@/lib/instagram/provider";
import { getAllMediaComments } from "@/lib/meta/client";
import { eligibleEntries, pickWinners } from "@/lib/giveaway/draw";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";
// Reading every comment on a big post takes a while.
export const maxDuration = 60;

const MAX_COMMENTS = 10_000;
// Leave room for the draw and the response inside maxDuration.
const READ_BUDGET_MS = 45_000;

const drawSchema = z.object({
  instagramAccountId: z.string().min(1).optional().nullable(),
  mediaId: z.string().regex(/^\d{5,40}$/),
  permalink: z
    .string()
    .url()
    .refine((url) => /^https:\/\/(www\.)?instagram\.com\//i.test(url))
    .optional()
    .nullable(),
  winners: z.number().int().min(1).max(50),
  keyword: z.string().trim().max(50).optional().nullable(),
  minMentions: z.number().int().min(0).max(10).default(0),
  uniquePerUser: z.boolean().default(true),
  excludeUsernames: z.array(z.string().trim().max(31)).max(200).default([]),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** GET: past draws, newest first. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  const draws = await prisma.giveawayDraw.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { instagramAccount: { select: { username: true } } },
  });
  return NextResponse.json({ success: true, data: draws });
}

/** POST: read the post's comments, pick winners at random and keep the result. */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  if (!canManageWorkspace(context.role)) return fail("Only owners and admins can run a giveaway", 403);

  const parsed = drawSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid input", 400);
  const rules = parsed.data;

  const account = await getWorkspaceInstagramAccount(context.workspaceId, rules.instagramAccountId ?? null);
  if (!account) return fail("Instagram account not connected.", 400);

  let comments;
  let complete: boolean;
  try {
    const instagram = await createInstagramContext(account);
    if (instagram.provider === "META") {
      ({ comments, complete } = await getAllMediaComments(instagram.accessToken, rules.mediaId, {
        max: MAX_COMMENTS,
        deadline: Date.now() + READ_BUDGET_MS,
      }));
    } else {
      comments = await getRecentMediaComments({ context: instagram, mediaId: rules.mediaId, sinceMs: 0, max: MAX_COMMENTS });
      complete = comments.length < MAX_COMMENTS;
    }
  } catch (error) {
    return fail(error instanceof MetaApiError ? error.message : "Could not read the comments", 502);
  }
  // Drawing from part of the comments would leave some entrants out.
  if (!complete) {
    return NextResponse.json(
      { success: false, error: "too_many_comments", commentsRead: comments.length },
      { status: 422 }
    );
  }

  const entries = eligibleEntries(
    comments,
    {
      winners: rules.winners,
      keyword: rules.keyword || null,
      minMentions: rules.minMentions,
      uniquePerUser: rules.uniquePerUser,
      excludeUsernames: rules.excludeUsernames,
    },
    { instagramId: account.instagramId, username: account.username }
  );
  const winners = pickWinners(entries, rules.winners);

  const draw = await prisma.giveawayDraw.create({
    data: {
      workspaceId: context.workspaceId,
      instagramAccountId: account.id,
      mediaId: rules.mediaId,
      permalink: rules.permalink ?? null,
      settings: {
        winners: rules.winners,
        keyword: rules.keyword || null,
        minMentions: rules.minMentions,
        uniquePerUser: rules.uniquePerUser,
        excludeUsernames: rules.excludeUsernames,
        commentsRead: comments.length,
      },
      entrants: entries.length,
      winners: winners.map(({ username, commentId, text }) => ({ username, commentId, text })),
      createdById: context.userId ?? null,
    },
  });

  return NextResponse.json({ success: true, data: { ...draw, commentsRead: comments.length } });
}
