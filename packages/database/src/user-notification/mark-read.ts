/**
 * @agentcenter/database - User Notification Operations
 *
 * Mark a single notification as read.
 * Returns the owner's userId for authorization checks.
 */

import { prisma } from "../client";

export async function getUserNotificationOwnerId(id: string): Promise<string | null> {
  const n = await prisma.userNotification.findUnique({
    where: { id },
    select: { userId: true },
  });
  return n?.userId ?? null;
}

export async function markUserNotificationRead(id: string): Promise<void> {
  await prisma.userNotification.update({
    where: { id },
    data: { status: "read", readAt: new Date() },
  });
}
