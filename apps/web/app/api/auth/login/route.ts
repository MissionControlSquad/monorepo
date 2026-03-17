import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import {
  verifyPassword,
  createSessionToken,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "@/server/admin-auth";
import { createRateLimiter } from "@/server/rate-limit";
import { ensureUserAndProfileForAdmin } from "../_lib/ensure-profile";
import { loginSchema } from "../../_lib/validation";
import { getClientIp } from "../../_lib/client-ip";

const loginLimiter = createRateLimiter({ max: 5, windowSec: 60 });

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const check = loginLimiter.check(ip);
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = loginSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }
  const { username, password } = result.data;

  const normalizedUsername = username.trim().toLowerCase();
  const admin = await prisma.adminUser.findUnique({
    where: { username: normalizedUsername },
  });

  if (!admin) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let profileId: string;
  try {
    const result = await ensureUserAndProfileForAdmin(admin.id, admin.username);
    profileId = result.profileId;
  } catch (err) {
    console.error("[auth/login] ensureUserAndProfileForAdmin failed:", err);
    return NextResponse.json(
      { error: "Failed to create user profile. Try again." },
      { status: 500 },
    );
  }

  const token = await createSessionToken({
    sub: admin.id,
    username: admin.username,
    profileId,
  });

  const response = NextResponse.json({
    success: true,
    username: admin.username,
    profileId,
  });
  response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}
