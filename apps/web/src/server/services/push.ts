import webpush from "web-push";
import { env } from "../env";
import { prisma } from "@agentcenter/database";
import { logError } from "../logger";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return false;
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Send a push notification to a single subscription.
 * Returns true if sent successfully, false if subscription is expired (410 Gone).
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: PushPayload,
): Promise<boolean> {
  if (!ensureConfigured()) return false;

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    const statusCode =
      err instanceof Error && "statusCode" in err ? (err as { statusCode: number }).statusCode : 0;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired — clean up
      await prisma.pushSubscription
        .delete({ where: { id: subscription.id } })
        .catch((err) => console.error("[push] Failed to clean up expired subscription:", err));
      return false;
    }
    logError(
      "push",
      `Failed to send push notification: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return false;
  }
}

/**
 * Send push notifications to all subscriptions for a user.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  await Promise.allSettled(subscriptions.map((sub) => sendPushNotification(sub, payload)));
}
