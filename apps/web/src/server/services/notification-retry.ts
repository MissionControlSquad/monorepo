import { findRetryableUserNotifications } from "@agentcenter/database";
import { dispatchNotification, handleDispatchFailure } from "./notification";
import { logError, log } from "../logger";
import { incrementCounter } from "./notification-metrics";

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 30_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Process retryable and quiet-hours-deferred notifications.
 * Picks up:
 *   - `status: "failed"` with `nextRetryAt <= now` and `retryCount < 5`
 *   - `status: "pending"` with `nextRetryAt <= now` (quiet-hours deferred push/email)
 */
export async function processRetries(): Promise<void> {
  const now = new Date();

  const records = await findRetryableUserNotifications(now, BATCH_SIZE);

  if (records.length === 0) return;

  log("notification-retry", `Processing ${records.length} retryable/deferred notifications`);

  for (const record of records) {
    try {
      await dispatchNotification(record);
      incrementCounter(record.status === "failed" ? "retriedSuccess" : "sent");
      if (record.status === "failed") incrementCounter("retried");
      log(
        "notification-retry",
        `Successfully dispatched ${record.channel} notification ${record.id}`,
      );
    } catch (err) {
      incrementCounter("retried");
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      logError(
        "notification-retry",
        `Retry failed for ${record.channel} notification ${record.id}: ${errMsg}`,
      );
      await handleDispatchFailure(record, errMsg).catch((failErr) =>
        console.error("[notification-retry] Failed to record dispatch failure:", failErr),
      );
    }
  }
}

export function startRetryProcessor(): void {
  if (intervalId) return;
  intervalId = setInterval(() => {
    processRetries().catch((err) => {
      logError("notification-retry", `Retry processor error: ${err.message}`);
    });
  }, POLL_INTERVAL_MS);
  intervalId.unref();
  log("notification-retry", "Retry processor started");
}

export function stopRetryProcessor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log("notification-retry", "Retry processor stopped");
  }
}
