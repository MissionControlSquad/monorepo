import { verifySessionToken, COOKIE_NAME, type SessionPayload } from "@/server/admin-auth";

/**
 * Extract and verify the admin session from request cookies.
 * Throws { error, status } on failure (compatible with handleError).
 */
export async function resolveSession(request: Request): Promise<SessionPayload> {
  const cookie = request.headers.get("cookie");
  if (!cookie) throw { error: "Not authenticated", status: 401 };

  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) throw { error: "Not authenticated", status: 401 };

  const session = await verifySessionToken(match[1].trim());
  if (!session) throw { error: "Invalid or expired session", status: 401 };

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

  // Import prisma lazily to avoid circular dependency issues
  const { prisma } = await import("@/server/prisma");

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.sub },
    select: { userId: true },
  });

  if (!admin?.userId) throw { error: "User account not found", status: 404 };

  return { userId: admin.userId, session };
}
