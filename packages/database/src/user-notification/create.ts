/**
 * @agentcenter/database - User Notification Operations
 *
 * Create a user notification record.
 */

import { prisma } from "../client";

export interface CreateUserNotificationInput {
  userId: string;
  type: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  taskId?: string | null;
  messageId?: string | null;
  url?: string | null;
  metadata?: unknown;
  dedupKey?: string;
  nextRetryAt?: Date | null;
}

export async function createUserNotification(data: CreateUserNotificationInput) {
  return prisma.userNotification.create({ data: data as Parameters<typeof prisma.userNotification.create>[0]["data"] });
}
