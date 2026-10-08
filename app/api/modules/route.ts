import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { syncModuleLinks } from "@/lib/modules/links";
import { moduleInputSchema, parseStoredCards } from "@/lib/modules/schema";
import { summarizeModuleClicks } from "@/lib/modules/stats";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

function fail(error: string, status: number, details?: unknown) {
  return NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });
}

async function requireContext(write: boolean) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { error: fail("Unauthorized", 401) } as const;
  if (write && !canManageWorkspace(context.role)) {
    return { error: fail("Only owners and admins can edit message modules", 403) } as const;
  }
  return { context } as const;
}

/** GET: every module with usage; ?id= one module with per-slot click counts. */
export async function GET(request: NextRequest) {
  const { context, error } = await requireContext(false);
  if (error) return error;
  const workspaceId = context.workspaceId;
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const moduleRecord = await prisma.messageModule.findFirst({
      where: { id, workspaceId },
      include: {
        links: { select: { id: true, card: true, slot: true, destinationUrl: true } },
        automations: { select: { id: true, name: true, dmOnly: true, isActive: true } },
      },
    });
    if (!moduleRecord) return fail("Module not found", 404);

    const clicks = await prisma.moduleLinkClick.findMany({
      where: { moduleLinkId: { in: moduleRecord.links.map((link) => link.id) } },
      select: { moduleLinkId: true, recipientHash: true, ipHash: true, automationId: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...moduleRecord,
        cards: parseStoredCards(moduleRecord.cards),
        clicks: summarizeModuleClicks(moduleRecord.links, clicks),
      },
    });
  }

  const modules = await prisma.messageModule.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      automations: { select: { id: true, name: true, dmOnly: true, isActive: true } },
      links: { select: { id: true, _count: { select: { clicks: true } } } },
    },
  });

  return NextResponse.json({
    success: true,
    data: modules.map(({ links, cards, ...rest }) => {
      const parsed = parseStoredCards(cards);
      return {
        ...rest,
        cardCount: parsed.length,
        coverImage: parsed.find((card) => card.imageUrl)?.imageUrl ?? null,
        clickCount: links.reduce((sum, link) => sum + link._count.clicks, 0),
      };
    }),
  });
}

/** POST: create a module, or `{ duplicateFrom }` to copy one. */
export async function POST(request: NextRequest) {
  const { context, error } = await requireContext(true);
  if (error) return error;
  const workspaceId = context.workspaceId;
  const body = await request.json().catch(() => null);

  if (body && typeof body.duplicateFrom === "string") {
    const source = await prisma.messageModule.findFirst({
      where: { id: body.duplicateFrom, workspaceId },
    });
    if (!source) return fail("Module not found", 404);
    const cards = parseStoredCards(source.cards);
    const created = await prisma.$transaction(async (tx) => {
      const copy = await tx.messageModule.create({
        data: {
          workspaceId,
          name: `${source.name} (copy)`.slice(0, 100),
          introText: source.introText,
          cards: cards as object[],
          utmSource: source.utmSource,
          utmMedium: source.utmMedium,
          utmCampaign: source.utmCampaign,
        },
      });
      await syncModuleLinks(tx, { workspaceId, moduleId: copy.id, cards, utm: copy });
      return copy;
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  }

  const parsed = moduleInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 400, parsed.error.flatten());

  const created = await prisma.$transaction(async (tx) => {
    const moduleRecord = await tx.messageModule.create({
      data: { workspaceId, ...parsed.data, cards: parsed.data.cards as object[] },
    });
    await syncModuleLinks(tx, {
      workspaceId,
      moduleId: moduleRecord.id,
      cards: parsed.data.cards,
      utm: moduleRecord,
    });
    return moduleRecord;
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}

/** PATCH ?id=: replace a module's content. Its links keep their slugs. */
export async function PATCH(request: NextRequest) {
  const { context, error } = await requireContext(true);
  if (error) return error;
  const workspaceId = context.workspaceId;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("Module ID required", 400);

  const parsed = moduleInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid input", 400, parsed.error.flatten());

  const existing = await prisma.messageModule.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) return fail("Module not found", 404);

  const updated = await prisma.$transaction(async (tx) => {
    const moduleRecord = await tx.messageModule.update({
      where: { id },
      data: { ...parsed.data, cards: parsed.data.cards as object[] },
    });
    await syncModuleLinks(tx, {
      workspaceId,
      moduleId: id,
      cards: parsed.data.cards,
      utm: moduleRecord,
    });
    return moduleRecord;
  });

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE ?id=. Refused while a campaign or DM rule still uses the module, so a
 * live reply never silently drops to its plain-text fallback.
 */
export async function DELETE(request: NextRequest) {
  const { context, error } = await requireContext(true);
  if (error) return error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("Module ID required", 400);

  const moduleRecord = await prisma.messageModule.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, automations: { select: { name: true } } },
  });
  if (!moduleRecord) return fail("Module not found", 404);
  if (moduleRecord.automations.length > 0) {
    return fail("Module is in use", 409, {
      usedBy: moduleRecord.automations.map((automation) => automation.name),
    });
  }

  await prisma.messageModule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
