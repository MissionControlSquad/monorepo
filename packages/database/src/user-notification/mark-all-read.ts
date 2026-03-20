/**
 * @agentcenter/database - User Notification Operations
 *
 * Mark all unread in-app notifications for a user as read.
 */

import { prisma } from "../client";

export async function markAllUserNotificationsRead(userId: string): Promise<void> {
  await prisma.userNotification.updateMany({
    where: { userId, channel: "in_app", readAt: null },
    data: { status: "read", readAt: new Date() },
  });
}
