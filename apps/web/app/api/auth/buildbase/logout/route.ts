// Clears the buildbase session + workspace-token cookies (Epic #1).
// Ported from the MissionControlSquad website; extended to also clear bb-workspace-token, and — since
// the auth bridge mints mc_session for buildbase users — to ALSO clear mc_session so signing out of
// buildbase fully signs the user out of the app (the middleware then redirects to /login). Called by
// BuildbaseProvider.onSignOut, which additionally clears the localStorage auth_token client-side.
const SESSION_COOKIE_NAME = "bb-session-id";
const WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";
const MC_SESSION_COOKIE = "mc_session";

// Cleared with Domain= too so a cross-subdomain (AUTH_COOKIE_DOMAIN) mc_session is actually removed.
// A bare Max-Age=0 with no Domain would leave a domain-scoped cookie in place. Harmless when unset.
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim();
const domainAttr = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : "";

export async function POST() {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
  headers.append(
    "Set-Cookie",
    `${WORKSPACE_TOKEN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
  // Clear both the host-only and (if configured) domain-scoped mc_session.
  headers.append("Set-Cookie", `${MC_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  if (domainAttr) {
    headers.append(
      "Set-Cookie",
      `${MC_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${domainAttr}`,
    );
  }
  return new Response(JSON.stringify({ success: true }), { headers });
}
