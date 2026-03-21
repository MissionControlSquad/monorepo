/**
 * @agentcenter/database - Push Subscription Operations
 *
 * CRUD operations for push subscriptions.
 */

import { prisma } from "../client";

export async function deleteExpiredPushSubscription(id: string): Promise<void> {
  await prisma.pushSubscription
    .delete({ where: { id } })
    .catch((err) => console.error("[push] Failed to clean up expired subscription:", err));
}

export async function getPushSubscriptionsForUser(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}
