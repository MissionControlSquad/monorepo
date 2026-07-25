import crypto from "crypto";
import type {
  NotificationChannel,
  UserNotificationType,
  UserNotification,
} from "@agentcenter/database";
import { createUserNotification, type CreateUserNotificationInput } from "@agentcenter/database";
import { deliverViaBuildbase } from "./notification-buildbase";
import { logError, logWarn } from "../logger";
import { incrementCounter } from "./notification-metrics";

// User-facing notifications after the buildbase cutover (.paperclip-parity/BUILDBASE-NOTIFICATION-CUTOVER.mdx):
//   - We OWN the history/feed: one UserNotification row per notification (the in-app record).
//   - buildbase OWNS delivery: push/email go through notification.send, gated by each member's
//     per-type preference (buildbase userManaged events). We hold no send/preference/quiet-hours
//     logic of our own — deleted with push.ts / email.ts / notification-retry / prefs.
// The in-app feed's per-type muting is applied client-side from buildbase preferences (decision B).

// ─── Rate limiter (in-memory, per-process) — guards the feed against flooding ───
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 300; // 5 minutes
const DEDUP_WINDOW_SEC = 60;

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
  return bucket.count > RATE_LIMIT_MAX;
}

// ─── Dedup key (short window, collapses duplicate triggers) ───
function generateDedupKey(params: NotifyParams): string {
  const window = Math.floor(Date.now() / (DEDUP_WINDOW_SEC * 1000));
  const raw = `${params.userId}:${params.type}:${params.taskId ?? ""}:${params.messageId ?? ""}:${window}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
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
  /**
   * Buildbase workspace id — stamped into metadata so the delivery adapter can route push/email
   * (buildbase notification.send is workspace-scoped). Omit and push/email delivery is skipped
   * (the in-app record is still written).
   */
  workspaceId?: string;
}

/**
 * Record a user-facing notification (in-app history/feed) and delegate push/email delivery to
 * buildbase. Creates exactly one UserNotification row; buildbase fans out to push/email itself.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const { userId, type, title, body, taskId, messageId, url } = params;

  if (isRateLimited(userId)) {
    incrementCounter("rateLimited");
    logWarn("notification", `Rate limited notifications for user ${userId}`);
    return;
  }

  const metadata: Record<string, unknown> | undefined = params.workspaceId
    ? { ...params.metadata, workspaceId: params.workspaceId }
    : params.metadata;
  const dedupKey = generateDedupKey(params);

  // 1) Our history + in-app feed — one row per notification.
  let record: UserNotification;
  try {
    record = await createUserNotification({
      userId,
      type,
      channel: "in_app" as NotificationChannel,
      status: "sent", // stored feed rows are immediately available; readAt tracks read state
      title,
      body,
      taskId,
      messageId,
      url,
      metadata: metadata ?? undefined,
      dedupKey: `${dedupKey}:in_app`,
    } as CreateUserNotificationInput);
    incrementCounter("created");
  } catch (err) {
    // P2002 = unique dedup collision within the window — drop silently.
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
      incrementCounter("deduped");
      return;
    }
    throw err;
  }

  // 2) buildbase owns push/email delivery (gated by the member's per-type preference). Dormant and
  //    a no-op until provisioned; never blocks the recorded in-app notification.
  try {
    await deliverViaBuildbase(record);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    logError("notification", `buildbase delivery error for ${record.id}: ${msg}`);
  }
}
