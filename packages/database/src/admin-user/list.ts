/**
 * @agentcenter/database - Admin User Operations
 *
 * List all admin users.
 */

import { prisma } from "../client";

export async function listAdminUsers() {
  return prisma.adminUser.findMany();
}
