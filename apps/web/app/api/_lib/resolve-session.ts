import { verifySessionToken, COOKIE_NAME, type SessionPayload } from "@/server/admin-auth";
import { readCookie } from "@/server/tenancy/buildbase";

/**
 * Extract and verify the admin session from request cookies.
 * Throws { error, status } on failure (compatible with handleError).
 */
export async function resolveSession(request: Request): Promise<SessionPayload> {
  const raw = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!raw) throw { error: "Not authenticated", status: 401, code: "UNAUTHENTICATED" };

  const session = await verifySessionToken(raw);
  if (!session) throw { error: "Invalid or expired session", status: 401, code: "SESSION_EXPIRED" };

  return session;
}

/**
 * Get the userId for the admin session.
 * The session `sub` is the AdminUser id; we need the linked User id.
 */
export async function resolveUserId(
  request: Request,
): Promise<{ userId: string; session: SessionPayload }> {
  const session = await resolveSession(request);

  const { getAdminUserUserId } = await import("@agentcenter/database");

  const userId = await getAdminUserUserId(session.sub);
  if (!userId) throw { error: "User account not found", status: 404 };

  return { userId, session };
}
