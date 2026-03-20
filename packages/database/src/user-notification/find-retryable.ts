/**
 * @agentcenter/database - User Notification Operations
 *
 * Find retryable and deferred notifications.
 */

import { prisma } from "../client";

export async function findRetryableUserNotifications(now: Date, batchSize: number) {
  return prisma.userNotification.findMany({
    where: {
      nextRetryAt: { lte: now },
      OR: [
        { status: "failed", retryCount: { lt: 5 } },
        { status: "pending", nextRetryAt: { not: null } },
      ],
    },
    orderBy: { nextRetryAt: "asc" },
    take: batchSize,
  });
}
