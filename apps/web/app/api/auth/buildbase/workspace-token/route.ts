import { NextRequest } from "next/server";
import { createJWT, verifyJWT } from "@/lib/jwt";
import { tenantWorkspaceId, verifyWorkspaceMembership } from "@/server/auth/buildbase-bridge";
import { BB_SESSION_COOKIE } from "@/server/tenancy/buildbase";

// Mints a workspace-scoped JWT ({ userId, workspaceId, userRole, email }) on workspace switch/add
// (Epic #1). Ported from the MissionControlSquad website; extended to ALSO set an httpOnly
// bb-workspace-token cookie so the GraphQL server can resolve ctx.tenancy per request (Slice 4).
const WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";

export async function POST(request: NextRequest) {
  const SYSTEM_SECRET = process.env.SYSTEM_SECRET;
  if (!SYSTEM_SECRET) {
    return Response.json({ success: false, message: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const existingToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const claims = existingToken ? await verifyJWT(existingToken, SYSTEM_SECRET) : null;
  if (!claims) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // SECURITY: identity + email are taken from the VERIFIED bearer claims (issued by buildbase, which
  // holds SYSTEM_SECRET), NEVER from the request body — otherwise any authenticated user could POST
  // { userId: "<victim>" } and mint a token for any workspace, defeating every downstream scoped()/
  // requireRole guard. The body may only NAME which workspace to switch to.
  const userId = String(claims.userId ?? "");
  const email = String(claims.email ?? "");

  let bodyWorkspaceId: string;
  try {
    const body = (await request.json()) as { workspaceId?: string };
    bodyWorkspaceId = body.workspaceId ?? "";
  } catch {
    return Response.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  if (!userId) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!bodyWorkspaceId) {
    return Response.json({ success: false, message: "workspaceId is required" }, { status: 400 });
  }

  let workspaceId = bodyWorkspaceId;
  // Default role source is the bearer claim (used only in self-host, where there is no bound workspace).
  let userRole = String(claims.userRole ?? "member");

  // ── SERVER-SIDE SWITCH-BLOCK (hosted, TENANT_WORKSPACE_ID set) ──────────────────────────────────
  // This container is bound to ONE workspace. The bb-session-id cookie is shared across every
  // *.agentcenter.cloud host, so without this guard a `workspace:changed` event for a DIFFERENT
  // workspace would re-mint bb-workspace-token for that other id and resolveTenancy() would trust it —
  // granting the user tenancy for the wrong workspace inside this tenant. So: refuse any workspaceId
  // that isn't the bound one, and never trust the bearer's role — re-verify membership against
  // buildbase and mint pinned to TENANT_WORKSPACE_ID with the role buildbase reports HERE. Fail-closed.
  const bound = tenantWorkspaceId();
  if (bound) {
    if (bodyWorkspaceId !== bound) {
      return Response.json(
        { success: false, message: "Workspace switching is not allowed in this tenant" },
        { status: 403 },
      );
    }
    const sessionId = request.cookies.get(BB_SESSION_COOKIE)?.value ?? "";
    const role = sessionId ? await verifyWorkspaceMembership(sessionId, bound, userId) : null;
    if (!role) {
      return Response.json(
        { success: false, message: "Not a member of this workspace" },
        { status: 403 },
      );
    }
    workspaceId = bound;
    userRole = role;
  }

  const token = await createJWT({ userId, workspaceId, userRole, email }, SYSTEM_SECRET);

  const isSecure = new URL(request.url).protocol === "https:";
  const cookieFlags = `HttpOnly; Path=/; SameSite=Lax${isSecure ? "; Secure" : ""}; Max-Age=604800`;
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", `${WORKSPACE_TOKEN_COOKIE}=${token}; ${cookieFlags}`);

  return new Response(JSON.stringify({ success: true, token }), { headers });
}
