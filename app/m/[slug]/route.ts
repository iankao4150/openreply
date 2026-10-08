import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  getRequestIp,
  hashClickIp,
  parseRecipientToken,
} from "@/lib/tracking/server";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

// Tracked redirect for a message module's card image or button. The link
// carries the sending campaign (`a`) and the recipient token (`r`), so clicks
// can be counted per card slot, per campaign and once per person.
export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;
  const link = await prisma.moduleLink.findUnique({
    where: { slug },
    select: { id: true, workspaceId: true, destinationUrl: true },
  });

  if (!link) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  const search = new URL(request.url).searchParams;
  const automationParam = search.get("a");
  // Only attribute to a campaign in the same workspace; anything else is noise.
  const automation =
    automationParam && /^[a-z0-9]{20,40}$/i.test(automationParam)
      ? await prisma.automation.findFirst({
          where: { id: automationParam, workspaceId: link.workspaceId },
          select: { id: true },
        })
      : null;

  await prisma.moduleLinkClick
    .create({
      data: {
        workspaceId: link.workspaceId,
        moduleLinkId: link.id,
        automationId: automation?.id ?? null,
        recipientHash: parseRecipientToken(search.get("r")),
        ipHash: hashClickIp(getRequestIp(request)),
        userAgent: request.headers.get("user-agent"),
      },
    })
    // A failed count must never cost the visitor the redirect.
    .catch((error) => console.error("[Module link] Click not recorded:", error));

  return NextResponse.redirect(link.destinationUrl, { status: 302 });
}
