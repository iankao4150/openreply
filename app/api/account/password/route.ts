import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentUserId } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** GET: whether the signed-in user has a password, and when it was set. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return fail("Unauthorized", 401);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, passwordUpdatedAt: true },
  });
  return NextResponse.json({
    success: true,
    data: { email: user?.email ?? null, hasPassword: Boolean(user?.passwordHash), updatedAt: user?.passwordUpdatedAt ?? null },
  });
}

const schema = z.object({
  currentPassword: z.string().max(256).optional(),
  newPassword: z.string().max(256),
});

/** POST {currentPassword?, newPassword}: set or change your own password. */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return fail("Unauthorized", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid", 400);
  const problem = passwordProblem(parsed.data.newPassword);
  if (problem) return fail(problem, 400);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  // Changing an existing password needs the current one, so an unattended
  // signed-in browser cannot be used to take the account over.
  if (user?.passwordHash && !(await verifyPassword(parsed.data.currentPassword ?? "", user.passwordHash))) {
    return fail("wrong_current", 403);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), passwordUpdatedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
