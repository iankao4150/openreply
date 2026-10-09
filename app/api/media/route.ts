import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { MAX_MEDIA_BYTES, sniffImage } from "@/lib/media";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/**
 * POST: upload one image (the raw file as the request body) for a message card.
 * Returns its public URL, which Instagram fetches when the card is sent.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return fail("Unauthorized", 401);
  if (!canManageWorkspace(context.role)) return fail("Only owners and admins can upload images", 403);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) return fail("too_large", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return fail("Empty file", 400);
  if (bytes.length > MAX_MEDIA_BYTES) return fail("too_large", 413);
  const kind = sniffImage(bytes);
  if (!kind) return fail("unsupported_type", 415);

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: context.workspaceId,
      contentType: kind.type,
      bytes,
      size: bytes.length,
      createdById: context.userId ?? null,
    },
    select: { id: true },
  });
  const url = `${getBaseUrl().replace(/\/$/, "")}/media/${asset.id}.${kind.ext}`;
  return NextResponse.json({ success: true, data: { url } }, { status: 201 });
}
