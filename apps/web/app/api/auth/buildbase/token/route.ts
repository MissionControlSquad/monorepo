import { NextRequest, NextResponse } from "next/server";
import { createJWT } from "@/lib/jwt";
import { bridgeBuildbaseSession } from "@/server/auth/buildbase-bridge";
import { COOKIE_NAME as MC_SESSION_COOKIE, getSessionCookieOptions } from "@/server/admin-auth";
import { BB_SESSION_COOKIE, WORKSPACE_TOKEN_COOKIE } from "@/server/tenancy/buildbase";

// buildbase OAuth code → session exchange (Epic #1). Ported from the MissionControlSquad website.
// Namespaced under /api/auth/buildbase/* to avoid colliding with the existing admin auth routes.
//
// AUTH BRIDGE: after a SUCCESSFUL token exchange (verified buildbase sessionId + user), this route
// mints the app's own `mc_session` cookie (the session the middleware trusts) alongside the buildbase
// `bb-session-id`, so the buildbase user is an authenticated app user. Fail-closed: mc_session is set
// ONLY when the exchange returned a valid session AND a user id; otherwise nothing is set and an error
// is returned. See src/server/auth/buildbase-bridge.ts for the security posture (authenticated identity
// only — capability is still governed by buildbase RBAC, never platform-admin).

export async function POST(request: NextRequest) {
  const SAAS_CLIENT_SECRET = process.env.SAAS_CLIENT_SECRET;
  const SAAS_SERVER_URL = process.env.SAAS_SERVER_URL;
  const SAAS_ORG_ID = process.env.SAAS_ORG_ID;
  const SAAS_CLIENT_ID = process.env.SAAS_CLIENT_ID;
  const SYSTEM_SECRET = process.env.SYSTEM_SECRET;

  let code: string;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code ?? "";
  } catch {
    return Response.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  if (!code || code.length < 10 || code.length > 256) {
    return Response.json({ success: false, message: "Invalid code" }, { status: 400 });
  }
  if (!SAAS_ORG_ID || !SAAS_CLIENT_ID || !SAAS_CLIENT_SECRET || !SYSTEM_SECRET) {
    return Response.json({ success: false, message: "buildbase not configured" }, { status: 503 });
  }

  const serverUrl = SAAS_SERVER_URL || "https://api.console.buildbase.app";

  const tokenRes = await fetch(`${serverUrl}/api/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      clientId: SAAS_CLIENT_ID,
      clientSecret: SAAS_CLIENT_SECRET,
      orgId: SAAS_ORG_ID,
    }),
  });

  if (!tokenRes.ok) {
    return Response.json({ success: false, message: "Token exchange failed" }, { status: 401 });
  }

  const raw = (await tokenRes.json()) as { data?: unknown };
  const result = (raw.data ?? raw) as {
    sessionId?: string;
    user?: { id?: string; _id?: string; email?: string; name?: string; role?: string };
  };
  const sessionId = result.sessionId;
  const user = result.user;

  if (!sessionId) {
    return Response.json({ success: false, message: "No session returned" }, { status: 401 });
  }

  const userId = user?.id || user?._id || "";
  // Fail-closed: a valid app session requires a verified buildbase user identity.
  if (!userId) {
    return Response.json({ success: false, message: "No user returned" }, { status: 401 });
  }

  // AUTH BRIDGE — enforce workspace membership, then upsert Profile + mint mc_session + workspace token.
  let bridge: Awaited<ReturnType<typeof bridgeBuildbaseSession>>;
  try {
    bridge = await bridgeBuildbaseSession({
      sessionId,
      user: { id: userId, email: user?.email, name: user?.name, role: user?.role },
    });
  } catch (err) {
    console.error("[auth/buildbase/token] session bridge failed:", err);
    // Fail-closed: set nothing (neither mc_session nor bb-session-id) and surface an error.
    return Response.json({ success: false, message: "Session bridge failed" }, { status: 500 });
  }
  if (bridge.status === "denied") {
    // Authenticated with buildbase but NOT a member of THIS tenant's workspace (or misconfigured).
    // Cross-tenant fail-closed: set NO cookies.
    return Response.json(
      {
        success: false,
        message: "You do not have access to this workspace",
        reason: bridge.reason,
      },
      { status: 403 },
    );
  }

  const token = await createJWT(
    {
      userId,
      workspaceId: bridge.workspaceId || null,
      userRole: bridge.role,
      email: user?.email || "",
    },
    SYSTEM_SECRET,
  );

  const isSecure = new URL(request.url).protocol === "https:";
  const response = NextResponse.json({ success: true, sessionId, token, user });

  // buildbase session cookie (unchanged semantics: httpOnly, 7-day, Lax, Secure on https).
  response.cookies.set(BB_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
    maxAge: 604800,
  });
  // App session cookie — same flags the admin login uses (incl. optional AUTH_COOKIE_DOMAIN).
  response.cookies.set(MC_SESSION_COOKIE, bridge.mcToken, getSessionCookieOptions());
  // Workspace-scoped token pinned to THIS tenant's workspace — HOST-ONLY (never domain-shared) so a
  // grant for one tenant can never resolve tenancy on another subdomain. resolveTenancy reads this.
  if (bridge.workspaceToken) {
    response.cookies.set(WORKSPACE_TOKEN_COOKIE, bridge.workspaceToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isSecure,
      maxAge: 604800,
    });
  }

  return response;
}
