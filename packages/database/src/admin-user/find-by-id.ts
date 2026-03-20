/**
 * @agentcenter/database - Admin User Operations
 *
 * Find an admin user by ID.
 */

import { prisma } from "../client";

export async function findAdminUserById(id: string) {
  return prisma.adminUser.findUnique({ where: { id } });
}
