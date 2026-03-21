/**
 * @agentcenter/database - User Notification Operations
 *
 * Update notification dispatch status.
 */

import { prisma } from "../client";
import type { NotificationStatus } from "@prisma/client";

export async function markUserNotificationSent(id: string): Promise<void> {
  await prisma.userNotification.update({
    where: { id },
    data: { status: "sent", sentAt: new Date() },
  });
}

export async function markUserNotificationFailed(
  id: string,
  data: {
    status: NotificationStatus;
    errorMsg: string;
    retryCount: number;
    nextRetryAt: Date | null;
  },
): Promise<void> {
  await prisma.userNotification.update({ where: { id }, data });
}
