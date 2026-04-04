import webpush from "web-push";
import { env } from "../env";
import { deleteExpiredPushSubscription, getPushSubscriptionsForUser } from "@agentcenter/database";
import { logError } from "../logger";

let configured = false;
let warnedMissingVapid = false;

function ensureConfigured() {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    if (!warnedMissingVapid) {
      warnedMissingVapid = true;
      const missing = [
        !env.VAPID_PUBLIC_KEY && "VAPID_PUBLIC_KEY",
        !env.VAPID_PRIVATE_KEY && "VAPID_PRIVATE_KEY",
        !env.VAPID_SUBJECT && "VAPID_SUBJECT",
      ]
        .filter(Boolean)
        .join(", ");
      console.warn(
        `[push] Push notifications disabled — missing env vars: ${missing}. ` +
          "Run: npx web-push generate-vapid-keys  and set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in your .env",
      );
    }
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
      await deleteExpiredPushSubscription(subscription.id);
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
 * Throws if VAPID keys are not configured (allows callers to retry later).
 * Returns false (no-op) if the user has no push subscriptions.
 * Returns true if at least one send was attempted.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) {
    throw new Error(
      "Push notifications not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars",
    );
  }

  const subscriptions = await getPushSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return false;

  await Promise.allSettled(subscriptions.map((sub) => sendPushNotification(sub, payload)));
  return true;
}
