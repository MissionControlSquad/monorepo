import { NextRequest } from "next/server";
import { createJWT, verifyJWT } from "@/lib/jwt";

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

  // SECURITY: identity + role are taken from the VERIFIED bearer claims (issued by buildbase, which
  // holds SYSTEM_SECRET), NEVER from the request body — otherwise any authenticated user could POST
  // { userRole: "owner", userId: "<victim>" } and mint an owner token for any workspace, defeating every
  // downstream scoped()/requireRole guard. The body may only name WHICH workspace to switch to.
  const userId = String(claims.userId ?? "");
  const userRole = String(claims.userRole ?? "member");
  const email = String(claims.email ?? "");

  let workspaceId: string;
  try {
    const body = (await request.json()) as { workspaceId?: string };
    workspaceId = body.workspaceId ?? "";
  } catch {
    return Response.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  if (!userId) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!workspaceId) {
    return Response.json({ success: false, message: "workspaceId is required" }, { status: 400 });
  }

  const token = await createJWT({ userId, workspaceId, userRole, email }, SYSTEM_SECRET);

  const isSecure = new URL(request.url).protocol === "https:";
  const cookieFlags = `HttpOnly; Path=/; SameSite=Lax${isSecure ? "; Secure" : ""}; Max-Age=604800`;
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", `${WORKSPACE_TOKEN_COOKIE}=${token}; ${cookieFlags}`);

  return new Response(JSON.stringify({ success: true, token }), { headers });
}
