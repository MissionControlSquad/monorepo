/**
 * Scheduled-retry backoff (Domain 9 #6) — pure, shared via @agentcenter/utils. Turns a transient run
 * failure (timeout / process-loss) into a bounded, owner-preserving retry with an increasing delay,
 * rather than leaving the work dead. No I/O; the service computes scheduledRetryAt = now + delay.
 */

/** Bounded transient-retry delay schedule, in ms (index = retryCount already consumed). Mirrors
 * Paperclip's BOUNDED_TRANSIENT_HEARTBEAT_RETRY_DELAYS_MS: 30s, 2m, 5m, 15m. */
export const RETRY_BACKOFF_MS = [30_000, 120_000, 300_000, 900_000] as const;

/** The maximum number of automatic transient retries before a run is left failed for escalation. */
export const MAX_RUN_RETRIES = RETRY_BACKOFF_MS.length;

/** Run statuses that are TRANSIENT (worth an automatic retry). A clean `failed` (non-zero exit from
 * the agent's own command) is NOT transient — only infra timeouts / lost processes are. */
const TRANSIENT_STATUSES = new Set(["timeout"]);

export function isTransientRunStatus(status: string): boolean {
  return TRANSIENT_STATUSES.has(status);
}

/**
 * Pure: should a run in `status` after `retryCount` prior retries be retried again? True only for a
 * transient status under the cap.
 */
export function shouldRetryRun(status: string, retryCount: number): boolean {
  return isTransientRunStatus(status) && retryCount < MAX_RUN_RETRIES;
}

/** Pure: the backoff delay (ms) for the NEXT retry given how many retries have already happened. */
export function retryBackoffMs(retryCount: number): number {
  const i = Math.max(0, Math.min(retryCount, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[i];
}

/** Pure: the instant a run should next be retried, or null if it should not be retried. */
export function nextRetryAt(status: string, retryCount: number, now: Date): Date | null {
  if (!shouldRetryRun(status, retryCount)) return null;
  return new Date(now.getTime() + retryBackoffMs(retryCount));
}
