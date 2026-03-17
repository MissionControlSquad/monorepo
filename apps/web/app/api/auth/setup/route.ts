import { NextResponse } from "next/server";
import { adminUserModel } from "@/server/models";
import {
  hashPassword,
  createSessionToken,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "@/server/admin-auth";
import { createRateLimiter } from "@/server/rate-limit";
import { ensureUserAndProfileForAdmin } from "../_lib/ensure-profile";
import { validateBody, setupSchema } from "../../_lib/validation";
import { getClientIp } from "../../_lib/client-ip";

const setupLimiter = createRateLimiter({ max: 3, windowSec: 60 });

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const check = setupLimiter.check(ip);
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } },
    );
  }
  // Only allow setup if no admin exists
  const existing = await adminUserModel.count();
  if (existing > 0) {
    return NextResponse.json(
      { error: "Admin account already exists. Please log in." },
      { status: 400 },
    );
  }

  const v = await validateBody(request, setupSchema);
  if (v.error) return v.error;
  const { username, password } = v.data;

  const passwordHash = await hashPassword(password);
  const admin = await adminUserModel.create({
    data: {
      username: username.trim().toLowerCase(),
      passwordHash,
    },
  });

  let profileId: string;
  try {
    const result = await ensureUserAndProfileForAdmin(admin.id, admin.username);
    profileId = result.profileId;
  } catch (err) {
    console.error("[auth/setup] ensureUserAndProfileForAdmin failed:", err);
    return NextResponse.json({ error: "Failed to create user profile." }, { status: 500 });
  }

  const token = await createSessionToken({
    sub: admin.id,
    username: admin.username,
    profileId,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}
