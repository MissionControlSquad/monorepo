/**
 * @agentcenter/database - Admin User Operations
 *
 * Update an admin user's password hash.
 */

import { prisma } from "../client";

export async function updateAdminUserPassword(
  adminId: string,
  passwordHash: string,
): Promise<{ id: string; username: string }> {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash },
    select: { id: true, username: true },
  });
}
