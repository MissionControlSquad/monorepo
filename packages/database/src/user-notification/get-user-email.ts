/**
 * @agentcenter/database - User Notification Operations
 *
 * Get the email address for a user.
 */

import { prisma } from "../client";

export async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}
