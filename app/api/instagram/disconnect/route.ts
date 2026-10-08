import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { clearMessengerProfile } from "@/lib/campaigns/ice-breakers";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body.instagramAccountId === "string" ? body.instagramAccountId : null;

  const where = {
    workspaceId: context.workspaceId,
    ...(instagramAccountId ? { id: instagramAccountId } : {}),
  };
  const leaving = await prisma.instagramAccount.findMany({
    where,
    select: {
      provider: true,
      accessToken: true,
      persistentMenu: true,
      automations: {
        where: { dmOnly: true, dmRuleType: "ICE_BREAKER", isActive: true },
        select: { id: true },
      },
    },
  });
  await Promise.all(leaving.map((account) => clearMessengerProfile(account)));

  await prisma.instagramAccount.deleteMany({ where });

  return NextResponse.json({ success: true });
}
