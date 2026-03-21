/**
 * @agentcenter/database - Admin User Operations
 *
 * Find an admin user by their username.
 */

import { prisma } from "../client";
import type { AdminUser } from "@prisma/client";

export async function findAdminUserByUsername(username: string): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { username } });
}
