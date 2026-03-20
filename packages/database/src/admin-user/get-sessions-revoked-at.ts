/**
 * @agentcenter/database - Admin User Operations
 *
 * Session revocation check.
 */

import { prisma } from "../client";

export async function getAdminUserSessionsRevokedAt(adminId: string) {
  return prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { sessionsRevokedAt: true },
  });
}

export async function revokeAllAdminUserSessions(adminId: string): Promise<void> {
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { sessionsRevokedAt: new Date() },
  });
}
