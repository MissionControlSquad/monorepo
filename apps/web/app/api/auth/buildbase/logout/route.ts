// Clears the buildbase session + workspace-token cookies (Epic #1).
// Ported from the MissionControlSquad website; extended to also clear bb-workspace-token.
const SESSION_COOKIE_NAME = "bb-session-id";
const WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";

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
  return new Response(JSON.stringify({ success: true }), { headers });
}
