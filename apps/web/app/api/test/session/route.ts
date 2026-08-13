import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { ensureUserAndProfileForAdmin } from "@agentcenter/database";
import { COOKIE_NAME, getSessionCookieOptions } from "@/server/admin-auth";
import { isTestEnv, mintTestSessionToken } from "@/server/auth/test-session";

/**
 * TEST-ONLY session bootstrap route.
 *
 * Production/dev auth is buildbase-only (no password login), which a headless Playwright run cannot
 * perform. This route mints an mc_session for a named test admin so e2e specs can authenticate. It is
 * FAIL-CLOSED and doubly gated:
 *   1. NODE_ENV must be "test" (via isTestEnv) — otherwise it 404s as if it does not exist.
 *   2. A shared secret (TEST_SESSION_SECRET) must match the `x-test-secret` header — otherwise 403.
 * It can never mint a session in dev or production.
 */
export async function POST(request: Request) {
  // Gate 1: only exists under test env. 404 (not 403) so prod/dev can't even tell it's here.
  if (!isTestEnv()) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Gate 2: shared secret.
  const secret = process.env.TEST_SESSION_SECRET;
  const provided = request.headers.get("x-test-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let username = "admin";
  try {
    const body = (await request.json()) as { username?: string };
    if (body.username && typeof body.username === "string") username = body.username;
  } catch {
    // default "admin"
  }
  const normalized = username.trim().toLowerCase();

  // Ensure a local AdminUser + User + Profile exist (the owner/actor identity), then mint the session.
  let admin = await prisma.adminUser.findUnique({ where: { username: normalized } });
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: { username: normalized, passwordHash: "test-only-no-login" },
    });
  }
  const { profileId } = await ensureUserAndProfileForAdmin(admin.id, admin.username);
  const token = await mintTestSessionToken({ sub: admin.id, username: admin.username, profileId });

  const response = NextResponse.json({ success: true, username: admin.username, profileId });
  response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}
