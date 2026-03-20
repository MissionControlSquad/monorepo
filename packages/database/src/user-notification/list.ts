/**
 * @agentcenter/database - User Notification Operations
 *
 * List notifications for a user with pagination.
 */

import { prisma } from "../client";

export interface ListUserNotificationsOptions {
  limit?: number;
  offset?: number;
  where?: Record<string, unknown>;
}

export async function listUserNotifications(
  userId: string,
  opts: ListUserNotificationsOptions = {},
) {
  const { limit = 20, offset = 0, where = {} } = opts;
  const combinedWhere = { userId, ...where };

  const [notifications, total] = await Promise.all([
    prisma.userNotification.findMany({
      where: combinedWhere,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        title: true,
        body: true,
        taskId: true,
        url: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userNotification.count({ where: combinedWhere }),
  ]);

  return { notifications, total };
}
