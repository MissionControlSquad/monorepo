/**
 * @agentcenter/database - User Notification Operations
 *
 * Manage push subscriptions (Web Push API).
 */

import { prisma } from "../client";

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function upsertPushSubscription(input: PushSubscriptionInput): Promise<void> {
  const { userId, endpoint, p256dh, auth, userAgent } = input;
  await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId, endpoint } },
    create: { userId, endpoint, p256dh, auth, userAgent },
    update: { p256dh, auth },
  });
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
