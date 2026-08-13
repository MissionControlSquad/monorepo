import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/server/admin-auth";

// App (operator) logout. Clears mc_session, plus the buildbase cookies so a buildbase-bridged user
// who hits the app logout is fully signed out of BOTH planes (symmetric with the buildbase logout
// route, which also clears mc_session).
const BB_SESSION_COOKIE = "bb-session-id";
const BB_WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim();

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  // Also clear a domain-scoped mc_session (AUTH_COOKIE_DOMAIN) — a bare delete only clears host-only.
  if (COOKIE_DOMAIN) {
    response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0, domain: COOKIE_DOMAIN });
  }
  response.cookies.delete(BB_SESSION_COOKIE);
  response.cookies.delete(BB_WORKSPACE_TOKEN_COOKIE);
  return response;
}
