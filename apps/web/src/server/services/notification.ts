import crypto from "crypto";
import type {
  NotificationChannel,
  UserNotificationType,
  UserNotification,
  UserNotificationPreference,
} from "@agentcenter/database";
import {
  getUserNotificationPreferences,
  createUserNotification,
  markUserNotificationSent,
  markUserNotificationFailed,
  getUserEmail,
  type CreateUserNotificationInput,
} from "@agentcenter/database";
import { sendPushToUser } from "./push";
import { sendEmail } from "./email";
import { renderEmailTemplate } from "./email-templates";
import { logError, logWarn, log } from "../logger";
import { incrementCounter } from "./notification-metrics";
import { QueueItemStatus } from "../constants";

// ─── Constants ──────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes
const JITTER_FACTOR = 0.2;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 300; // 5 minutes

const DEDUP_WINDOW_SEC = 60;

/** Map notification type enum to preference field name */
const TYPE_PREF_MAP: Record<UserNotificationType, string> = {
  task_done: "taskDone",
  task_needs_review: "taskNeedsReview",
  task_clarification_requested: "taskClarificationRequested",
  task_approved: "taskApproved",
  task_rejected: "taskRejected",
  new_comment: "newComment",
  mention: "mention",
  deliverable_submitted: "deliverableSubmitted",
  task_assigned: "taskAssigned",
  team_update: "teamUpdate",
  document_added: "documentAdded",
};

// ─── Rate Limiter (in-memory, per-process) ──────────────────────────

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const key = `notif-rl:${userId}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_SEC * 1000 });
    return false;
  }

  bucket.count++;
  if (bucket.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// ─── Dedup Key ──────────────────────────────────────────────────────

function generateDedupKey(params: NotifyParams): string {
  const window = Math.floor(Date.now() / (DEDUP_WINDOW_SEC * 1000));
  const raw = `${params.userId}:${params.type}:${params.taskId ?? ""}:${params.messageId ?? ""}:${window}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

// ─── Quiet Hours ────────────────────────────────────────────────────

function getQuietHoursEndTime(prefs: UserNotificationPreference): Date | null {
  if (!prefs.quietStart || !prefs.quietEnd || !prefs.timezone) return null;

  let tz = prefs.timezone;
  try {
    // Validate timezone
    Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const currentHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const currentMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const currentMinutes = currentHour * 60 + currentMinute;

  const [startH, startM] = prefs.quietStart.split(":").map(Number);
  const [endH, endM] = prefs.quietEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let inQuietHours = false;
  if (startMinutes <= endMinutes) {
    // Same-day window (e.g. 09:00 - 17:00)
    inQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight window (e.g. 22:00 - 07:00)
    inQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  if (!inQuietHours) return null;

  // Calculate end time as an absolute Date
  // Get the current date in the user's timezone
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = dateFormatter.format(now); // YYYY-MM-DD

  // Build a Date for the quiet end in the user's TZ
  // If overnight and we're past midnight, end is today; if before midnight, end is tomorrow
  const endDateObj = new Date(`${dateStr}T${prefs.quietEnd.padStart(5, "0")}:00`);

  // Approximate offset: convert user-local end time to UTC
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = now.getTime() - localNow.getTime();
  endDateObj.setTime(endDateObj.getTime() + offsetMs);

  // If end is in the past (overnight case), push to tomorrow
  if (endDateObj.getTime() <= now.getTime()) {
    endDateObj.setDate(endDateObj.getDate() + 1);
  }

  return endDateObj;
}

// ─── Backoff ────────────────────────────────────────────────────────

export function computeNextRetryAt(retryCount: number): Date {
  const delay = Math.min(Math.pow(2, retryCount) * BASE_BACKOFF_MS, MAX_BACKOFF_MS);
  const jitter = delay * JITTER_FACTOR * (Math.random() * 2 - 1);
  return new Date(Date.now() + delay + jitter);
}

// ─── Dispatch ───────────────────────────────────────────────────────

export async function dispatchNotification(record: UserNotification): Promise<void> {
  switch (record.channel) {
    case "in_app":
      await markUserNotificationSent(record.id);
      break;

    case "push":
      // sendPushToUser throws if VAPID is not configured (error propagates to handleDispatchFailure)
      // returns false (no-op) if user has no subscriptions — still mark sent
      await sendPushToUser(record.userId, {
        title: record.title,
        body: record.body,
        url: record.url ?? undefined,
      });
      await markUserNotificationSent(record.id);
      break;

    case "email": {
      const email = await getUserEmail(record.userId);
      const user = email ? { email } : null;
      if (!user?.email) {
        await markUserNotificationSent(record.id);
        break;
      }

      const { html, text } = renderEmailTemplate(record.type, {
        title: record.title,
        body: record.body,
        url: record.url ?? undefined,
      });
      const sent = await sendEmail({
        to: user.email,
        subject: record.title,
        html,
        text,
      });

      if (sent) {
        await markUserNotificationSent(record.id);
      } else {
        throw new Error("Email delivery failed");
      }
      break;
    }
  }
}

export async function handleDispatchFailure(
  record: UserNotification,
  errorMsg: string,
): Promise<void> {
  const nextCount = record.retryCount + 1;

  if (nextCount >= MAX_RETRIES) {
    // Dead letter
    await markUserNotificationFailed(record.id, {
      status: "failed",
      errorMsg: `[dead] ${errorMsg}`.slice(0, 500),
      retryCount: nextCount,
      nextRetryAt: null,
    });
    incrementCounter("deadLettered");
    logError(
      "notification",
      `Dead-lettered ${record.channel} notification ${record.id} after ${nextCount} retries`,
    );
  } else {
    const nextRetryAt = computeNextRetryAt(nextCount);
    await markUserNotificationFailed(record.id, {
      status: "failed",
      errorMsg: errorMsg.slice(0, 500),
      retryCount: nextCount,
      nextRetryAt,
    });
    incrementCounter("failed");
    logWarn(
      "notification",
      `Dispatch failed for ${record.channel} notification ${record.id}, retry ${nextCount} at ${nextRetryAt.toISOString()}`,
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export interface NotifyParams {
  userId: string;
  type: UserNotificationType;
  title: string;
  body: string;
  taskId?: string;
  messageId?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

/**
 * Central notification dispatcher.
 * Creates DB records and dispatches to push/email/in_app channels independently.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const { userId, type, title, body, taskId, messageId, url, metadata } = params;

  // Rate limit check
  if (isRateLimited(userId)) {
    incrementCounter("rateLimited");
    logWarn("notification", `Rate limited notifications for user ${userId}`);
    return;
  }

  // Load user preferences (create defaults if none exist)
  const prefs = await getUserNotificationPreferences(userId);

  // Check if this notification type is enabled
  const prefField = TYPE_PREF_MAP[type];
  if (prefField && !(prefs as any)[prefField]) return;

  // Determine channels
  const channels: NotificationChannel[] = params.channels ?? [];
  if (!params.channels) {
    if (prefs.inAppEnabled) channels.push("in_app");
    if (prefs.pushEnabled) channels.push("push");
    if (prefs.emailEnabled) channels.push("email");
  }

  if (channels.length === 0) return;

  // Check quiet hours (exempt in_app)
  const quietEnd = getQuietHoursEndTime(prefs);

  // Generate dedup key
  const dedupKey = generateDedupKey(params);

  // Create DB records for each channel
  const records: UserNotification[] = [];
  for (const channel of channels) {
    const isDeferred = quietEnd && channel !== "in_app";

    try {
      const record = await createUserNotification({
        userId,
        type,
        channel,
        status: QueueItemStatus.PENDING,
        title,
        body,
        taskId,
        messageId,
        url,
        metadata: (metadata as any) ?? undefined,
        dedupKey: `${dedupKey}:${channel}`,
        nextRetryAt: isDeferred ? quietEnd : undefined,
      } as CreateUserNotificationInput);
      records.push(record);
      incrementCounter("created");

      if (isDeferred) {
        incrementCounter("quietDeferred");
        log(
          "notification",
          `Deferred ${channel} notification ${record.id} until quiet hours end ${quietEnd.toISOString()}`,
        );
      }
    } catch (err) {
      // P2002 = unique constraint violation (dedup)
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
        incrementCounter("deduped");
        log("notification", `Deduplicated ${channel} notification for user ${userId} type ${type}`);
        continue;
      }
      throw err;
    }
  }

  // Dispatch non-deferred records
  await Promise.allSettled(
    records
      .filter((r) => !(quietEnd && r.channel !== "in_app"))
      .map(async (record) => {
        try {
          await dispatchNotification(record);
          incrementCounter("sent");
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          logError("notification", `Failed to dispatch ${record.channel}: ${errMsg}`);
          await handleDispatchFailure(record, errMsg).catch((failErr) =>
            console.error("[notification] Failed to record dispatch failure:", failErr),
          );
        }
      }),
  );
}
