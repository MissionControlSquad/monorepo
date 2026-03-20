/**
 * @agentcenter/database - Health Operations
 *
 * Notification delivery health metrics used by the health-check endpoint.
 */

import { prisma } from "../client";

export interface NotificationHealthStats {
  failedCount: number;
  deadCount: number;
}

export async function getNotificationHealthStats(): Promise<NotificationHealthStats> {
  const [failedCount, deadCount] = await Promise.all([
    prisma.userNotification.count({
      where: { status: "failed", retryCount: { lt: 5 } },
    }),
    prisma.userNotification.count({
      where: { errorMsg: { startsWith: "[dead]" } },
    }),
  ]);
  return { failedCount, deadCount };
}
