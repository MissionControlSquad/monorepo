/**
 * @agentcenter/database - Admin User Operations
 *
 * Get the linked User ID for an admin user.
 * Returns null if the admin does not exist or has no linked user.
 */

import { prisma } from "../client";

export async function getAdminUserUserId(adminId: string): Promise<string | null> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { userId: true },
  });
  return admin?.userId ?? null;
}
