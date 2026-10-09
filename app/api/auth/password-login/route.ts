import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passwordLogin, sessionCookieName } from "@/lib/auth/password-login";
import { getRequestIp } from "@/lib/tracking/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

/** POST {email, password}: sign in with a password set in Settings. */
export async function POST(request: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  // A login form on another site must not be able to post here.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(base).origin) {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "invalid" }, { status: 400 });

  const result = await passwordLogin({ ...parsed.data, ip: getRequestIp(request) });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.reason },
      { status: result.reason === "locked" ? 429 : 401 }
    );
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(sessionCookieName(base), result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    expires: result.expires,
  });
  return response;
}
