/**
 * @agentcenter/database - User Notification Operations
 *
 * Get or update a user's notification preferences.
 */

import { prisma } from "../client";

export async function getUserNotificationPreferences(userId: string) {
  return prisma.userNotificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function saveUserNotificationPreferences(
  userId: string,
  data: Record<string, unknown>,
) {
  return prisma.userNotificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
