import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import {
  hashPassword,
  createSessionToken,
  getSessionCookieOptions,
  revokeAllSessions,
  COOKIE_NAME,
} from "@/server/admin-auth";
import { createRateLimiter } from "@/server/rate-limit";
import { consumeResetToken, invalidateAllResetTokens } from "@/server/password-reset";
import { resetPasswordSchema } from "../../_lib/validation";
import { ensureUserAndProfileForAdmin } from "../_lib/ensure-profile";
import { getClientIp } from "../../_lib/client-ip";

const resetLimiter = createRateLimiter({ max: 5, windowSec: 300 });

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const check = resetLimiter.check(ip);
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return NextResponse.json({ error: messages.join("; ") }, { status: 400 });
  }

  const { token, newPassword } = parsed.data;

  const result = await consumeResetToken(token);
  if (!result) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const { adminUserId } = result;

  // Update password
  const newHash = await hashPassword(newPassword);
  const admin = await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { passwordHash: newHash },
    select: { id: true, username: true },
  });

  // Revoke all sessions and invalidate remaining tokens
  await revokeAllSessions(adminUserId);
  await invalidateAllResetTokens(adminUserId);

  // Auto-login: create new session
  let profileId: string;
  try {
    const profileResult = await ensureUserAndProfileForAdmin(admin.id, admin.username);
    profileId = profileResult.profileId;
  } catch {
    // Password was reset successfully, but auto-login failed — user can log in manually
    return NextResponse.json({ success: true, autoLogin: false });
  }

  const sessionToken = await createSessionToken({
    sub: admin.id,
    username: admin.username,
    profileId,
  });

  const response = NextResponse.json({
    success: true,
    autoLogin: true,
    username: admin.username,
    profileId,
  });
  response.cookies.set(COOKIE_NAME, sessionToken, getSessionCookieOptions());
  return response;
}
