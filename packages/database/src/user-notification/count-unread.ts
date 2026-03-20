/**
 * @agentcenter/database - User Notification Operations
 *
 * Count unread in-app notifications for a user.
 */

import { prisma } from "../client";

export async function countUnreadUserNotifications(userId: string): Promise<number> {
  return prisma.userNotification.count({
    where: { userId, channel: "in_app", readAt: null },
  });
}
