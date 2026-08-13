import { NextRequest, NextResponse } from "next/server";
import { getBuildbase, isBuildbaseConfigured, BB_SESSION_COOKIE } from "@/server/tenancy/buildbase";
import { bridgeBuildbaseSession } from "@/server/auth/buildbase-bridge";
import { COOKIE_NAME as MC_SESSION_COOKIE, getSessionCookieOptions } from "@/server/admin-auth";

// Auto-SSO — the PRIMARY entry path. A user who signed in at the landing site arrives here already
// carrying a valid `bb-session-id` cookie (same buildbase org) but no `mc_session`. The middleware
// (which cannot do DB/network work on the edge) redirects such requests here BEFORE /login. This
// route validates the buildbase session SERVER-SIDE, upserts the local Profile, mints `mc_session`,
// and 302s straight to the originally-requested path — no login screen.
//
// Fail-closed: an invalid/expired/absent buildbase session, or any error, redirects to /login and
// sets nothing. This route is in the middleware public allowlist (/api/auth/*) so it never loops.

/**
 * Only allow same-origin, path-only redirect targets (open-redirect guard). Must start with a single
 * "/" and not "//" or "/\" (protocol-relative). Anything else falls back to "/".
 */
function safeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const loginUrl = new URL("/login", request.url);
  const redirectToLogin = () => NextResponse.redirect(loginUrl);

  // buildbase not configured → there is no SSO to perform; fall back to the login screen.
  if (!isBuildbaseConfigured()) return redirectToLogin();

  const sessionId = request.cookies.get(BB_SESSION_COOKIE)?.value;
  if (!sessionId) return redirectToLogin();

  const bb = getBuildbase();
  if (!bb) return redirectToLogin();

  // Validate the session against buildbase and fetch the user. getProfile() throws (e.g. 401) when
  // the session is invalid/revoked/expired — treat ANY failure as "not authenticated".
  let bbUser: { _id?: string; id?: string; email?: string; name?: string; role?: string };
  try {
    bbUser = await bb.withSession(sessionId).users.getProfile();
  } catch {
    return redirectToLogin();
  }

  const buildbaseUserId = bbUser?._id || bbUser?.id || "";
  if (!buildbaseUserId) return redirectToLogin();

  // Bridge: enforce workspace membership, upsert Profile, mint mc_session + workspace token.
  let bridge: Awaited<ReturnType<typeof bridgeBuildbaseSession>>;
  try {
    bridge = await bridgeBuildbaseSession({
      sessionId,
      user: { id: buildbaseUserId, email: bbUser.email, name: bbUser.name, role: bbUser.role },
    });
  } catch (err) {
    console.error("[auth/buildbase/sso] session bridge failed:", err);
    return redirectToLogin();
  }
  if (bridge.status === "denied") {
    // Authenticated with buildbase but NOT a member of THIS tenant's workspace — cross-tenant
    // fail-closed: set nothing, send to a clear no-access page (not /login, which would just loop).
    return NextResponse.redirect(new URL("/no-access", request.url));
  }

  const isSecure = new URL(request.url).protocol === "https:";
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(MC_SESSION_COOKIE, bridge.mcToken, getSessionCookieOptions());
  // Host-only workspace token pinned to THIS tenant (see token route for why it is never shared).
  if (bridge.workspaceToken) {
    response.cookies.set("bb-workspace-token", bridge.workspaceToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isSecure,
      maxAge: 604800,
    });
  }
  return response;
}
