import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { menuSchema, syncPersistentMenu } from "@/lib/campaigns/persistent-menu";

export const runtime = "nodejs";

/**
 * The workspace's connected Instagram accounts — just enough for an account
 * selector. This is a single indexed query, unlike /api/dashboard/stats which
 * runs the full analytics aggregation. Pages that only need the account list
 * (e.g. the inbox) should use this so they aren't gated on heavy stats.
 */
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const instagramAccounts = await prisma.instagramAccount.findMany({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      username: true,
      instagramId: true,
      name: true,
      humanPauseMinutes: true,
      persistentMenu: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      instagramAccounts,
      selectedInstagramAccountId: instagramAccounts[0]?.id ?? null,
    },
  });
}

const settingsSchema = z
  .object({
    // 0 turns the pause off; at most a day.
    humanPauseMinutes: z.number().int().min(0).max(1440).optional(),
    persistentMenu: menuSchema.optional(),
  })
  .refine((d) => d.humanPauseMinutes !== undefined || d.persistentMenu !== undefined);

/** PATCH ?id=: per-account automation settings. */
export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can change account settings" },
      { status: 403 }
    );
  }
  const id = request.nextUrl.searchParams.get("id");
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  // Menu items may only send modules of this workspace.
  const moduleIds = (parsed.data.persistentMenu ?? []).flatMap((item) => (item.moduleId ? [item.moduleId] : []));
  if (moduleIds.length > 0) {
    const found = await prisma.messageModule.count({
      where: { workspaceId: context.workspaceId, id: { in: moduleIds } },
    });
    if (found !== new Set(moduleIds).size) {
      return NextResponse.json({ success: false, error: "Module not found" }, { status: 400 });
    }
  }
  const updated = await prisma.instagramAccount.updateMany({
    where: { id, workspaceId: context.workspaceId },
    data: {
      ...(parsed.data.humanPauseMinutes !== undefined ? { humanPauseMinutes: parsed.data.humanPauseMinutes } : {}),
      ...(parsed.data.persistentMenu !== undefined ? { persistentMenu: parsed.data.persistentMenu } : {}),
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
  }
  const menuError =
    parsed.data.persistentMenu !== undefined ? await syncPersistentMenu(id) : null;
  return NextResponse.json({ success: true, menuError });
}
