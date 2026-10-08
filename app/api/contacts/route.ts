import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { MESSAGING_WINDOW_MS, normalizeTags, TAG_MAX_LENGTH } from "@/lib/contacts/record";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** Spreadsheet apps run cells starting with these as formulas. */
function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * GET: contacts of the workspace, newest activity first.
 * ?accountId= one account; ?tag= with this tag; ?q= username contains;
 * ?window=open only people who can be messaged now; ?cursor= next page;
 * ?format=csv everything matching, as a file.
 */
export async function GET(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  const params = request.nextUrl.searchParams;
  const now = Date.now();

  const accountFilter = params.get("accountId") ? { instagramAccountId: params.get("accountId") as string } : {};
  const where: Prisma.ContactWhereInput = {
    workspaceId: context.workspaceId,
    ...accountFilter,
    ...(params.get("tag") ? { tags: { has: params.get("tag") as string } } : {}),
    ...(params.get("q") ? { username: { contains: (params.get("q") as string).replace(/^@/, ""), mode: "insensitive" } } : {}),
    ...(params.get("window") === "open" ? { lastInboundAt: { gt: new Date(now - MESSAGING_WINDOW_MS) } } : {}),
  };

  if (params.get("format") === "csv") {
    if (!canManageWorkspace(context.role)) return fail("Only owners and admins can export contacts", 403);
    const rows = await prisma.contact.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: 50_000,
      include: { instagramAccount: { select: { username: true } } },
    });
    const header = ["account", "username", "instagram_user_id", "tags", "first_seen", "last_seen", "last_message", "last_comment", "interactions"];
    const lines = rows.map((c) =>
      [
        c.instagramAccount.username,
        c.username,
        c.userId,
        c.tags.join("|"),
        c.firstSeenAt.toISOString(),
        c.lastSeenAt.toISOString(),
        c.lastInboundAt?.toISOString(),
        c.lastCommentAt?.toISOString(),
        c.interactions,
      ]
        .map(csvCell)
        .join(",")
    );
    return new NextResponse(`﻿${[header.join(","), ...lines].join("\n")}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${new Date(now).toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const cursor = params.get("cursor");
  const [contacts, total, openWindow, tagRows] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { instagramAccount: { select: { username: true } } },
    }),
    prisma.contact.count({ where }),
    prisma.contact.count({
      where: { workspaceId: context.workspaceId, ...accountFilter, lastInboundAt: { gt: new Date(now - MESSAGING_WINDOW_MS) } },
    }),
    // Counted in the database: one row per tag, however many contacts.
    prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tag, count(*)::int AS count
      FROM "Contact", unnest("tags") AS tag
      WHERE "workspaceId" = ${context.workspaceId}
      ${params.get("accountId") ? Prisma.sql`AND "instagramAccountId" = ${params.get("accountId")}` : Prisma.empty}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT 200`,
  ]);

  const page = contacts.slice(0, PAGE_SIZE);
  return NextResponse.json({
    success: true,
    data: {
      contacts: page.map((c) => ({
        id: c.id,
        instagramAccountId: c.instagramAccountId,
        account: c.instagramAccount.username,
        userId: c.userId,
        username: c.username,
        tags: c.tags,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        lastInboundAt: c.lastInboundAt,
        lastCommentAt: c.lastCommentAt,
        interactions: c.interactions,
        canMessage: Boolean(c.lastInboundAt && now - c.lastInboundAt.getTime() < MESSAGING_WINDOW_MS),
      })),
      nextCursor: contacts.length > PAGE_SIZE ? page[page.length - 1].id : null,
      total,
      openWindow,
      tags: tagRows,
    },
  });
}

const patchSchema = z.object({ tags: z.array(z.string().trim().min(1).max(TAG_MAX_LENGTH)).max(30) });

/** PATCH ?id=: replace a contact's tags. */
export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  if (!canManageWorkspace(context.role)) return fail("Only owners and admins can edit contacts", 403);
  const id = request.nextUrl.searchParams.get("id");
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success) return fail("Invalid input", 400);
  const updated = await prisma.contact.updateMany({
    where: { id, workspaceId: context.workspaceId },
    data: { tags: normalizeTags(parsed.data.tags) },
  });
  if (updated.count === 0) return fail("Contact not found", 404);
  return NextResponse.json({ success: true });
}
