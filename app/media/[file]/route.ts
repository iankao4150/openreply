import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// Uploaded card images. Public on purpose: Instagram fetches them when a card
// is sent. Ids are unguessable cuids; only image types are ever stored.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.(jpg|png|webp|gif)$/i, "");
  if (!/^[a-z0-9]{20,40}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { contentType: true, bytes: true },
  });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(asset.bytes), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
