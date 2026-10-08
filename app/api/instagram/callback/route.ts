import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl, usesFacebookLogin } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import {
  getDataAccessExpiry,
  getInstagramLinkedPages,
  getLongLivedToken,
  getLongLivedUserToken,
  getUserInfo,
  subscribeInstagramAccountToWebhooks,
} from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

type AccountData = {
  username: string;
  name?: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  accessExpiresAt?: Date | null;
  webhookSubscribed: boolean;
};

/** Upsert a direct-Meta account. False when another workspace or provider owns it. */
async function saveMetaAccount(
  workspaceId: string,
  instagramId: string,
  data: AccountData
): Promise<boolean> {
  const existing = await prisma.instagramAccount.findUnique({ where: { instagramId } });
  if (existing) {
    const updated = await prisma.instagramAccount.updateMany({
      where: { id: existing.id, workspaceId, provider: 'META' }, data,
    });
    return updated.count > 0;
  }
  await prisma.instagramAccount.create({ data: { ...data, workspaceId, instagramId, provider: 'META' } });
  return true;
}

async function subscribeWebhooks(instagramId: string, token: string): Promise<boolean> {
  try {
    const subscription = await subscribeInstagramAccountToWebhooks(instagramId, token);
    return Boolean(subscription.success);
  } catch (subscriptionError) {
    console.warn("[Instagram Callback] Webhook subscription failed:", subscriptionError);
    return false;
  }
}

/**
 * Facebook Login (META_LOGIN_MODE=facebook): the login yields a user token, and
 * every Page it manages with a linked Instagram professional account becomes a
 * connected account, stored with that Page's non-expiring token.
 */
async function connectFacebookLoginAccounts(
  code: string,
  redirectUri: string,
  workspaceId: string
): Promise<"connected" | "already_connected"> {
  const { accessToken: shortLivedToken } = await exchangeCodeForToken(code, redirectUri);
  const userToken = await getLongLivedUserToken(shortLivedToken);
  const pages = await getInstagramLinkedPages(userToken);
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Page with a linked Instagram professional account was granted to this app"
    );
  }

  let connected = 0;
  for (const page of pages) {
    const instagramId = page.instagram.user_id ?? page.instagram.id;
    const connection = await canConnectInstagramAccount({ workspaceId, instagramId });
    if (!connection.allowed) continue;

    const saved = await saveMetaAccount(workspaceId, instagramId, {
      username: page.instagram.username,
      name: page.instagram.name,
      accessToken: encryptToken(page.pageAccessToken),
      tokenExpiresAt: null,
      accessExpiresAt: await getDataAccessExpiry(page.pageAccessToken),
      webhookSubscribed: await subscribeWebhooks(instagramId, page.pageAccessToken),
    });
    if (saved) connected++;
  }

  return connected > 0 ? "connected" : "already_connected";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback`;
    if (usesFacebookLogin()) {
      const outcome = await connectFacebookLoginAccounts(code, redirectUri, state.workspaceId);
      return NextResponse.redirect(
        outcome === "connected"
          ? `${baseUrl}/dashboard?connected=true`
          : `${baseUrl}/settings?instagram=already_connected`
      );
    }

    const { accessToken: shortLivedToken } = await exchangeCodeForToken(
      code,
      redirectUri
    );
    const { accessToken: longLivedToken, expiresIn } =
      await getLongLivedToken(shortLivedToken);
    const userInfo = await getUserInfo(longLivedToken);
    // Webhooks and the messaging API key off the professional account ID
    // (user_id), not the app-scoped `id`. Store user_id so comment webhooks
    // can be matched back to this account. Fall back to id if user_id is
    // ever absent.
    const instagramId = userInfo.user_id ?? userInfo.id;
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });

    if (!connection.allowed) {
      return NextResponse.redirect(
        `${baseUrl}/settings?instagram=already_connected`
      );
    }

    const encryptedToken = encryptToken(longLivedToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const saved = await saveMetaAccount(state.workspaceId, instagramId, {
      username: userInfo.username,
      name: userInfo.name,
      accessToken: encryptedToken,
      tokenExpiresAt,
      webhookSubscribed: await subscribeWebhooks(instagramId, longLivedToken),
    });
    if (!saved) return NextResponse.redirect(`${baseUrl}/settings?instagram=already_connected`);

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Instagram Callback] Error:", err);
    // The message is the only diagnostic a self-hoster gets for a failed
    // connect, so persist it alongside the other operational events rather
    // than leaving it in server logs they may not be able to reach.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?instagram=failed&reason=${encodeURIComponent(
        message.slice(0, 200)
      )}`
    );
  }
}
