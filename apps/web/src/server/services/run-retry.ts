import { logError } from "@/server/logger";
/**
 * Scheduled run retries (Domain 9 #6). A transient run failure (timeout) is not left dead: the run is
 * stamped with a `scheduledRetryAt` (bounded backoff), and the reap cron later PROMOTES it into a fresh
 * queued run for the SAME agent + task (owner-preserving), linked via retryOfRunId. Retries are capped;
 * on exhaustion the run is simply left failed for higher-level recovery. All best-effort, workspace-safe.
 */
import { prisma } from "@/server/prisma";
import type { AgentRun } from "@agentcenter/database";
import { nextRetryAt, shouldRetryRun } from "@agentcenter/utils";

/**
 * At run finalization: if the run ended in a transient status (timeout) under the retry cap, stamp
 * scheduledRetryAt so the reap cron re-dispatches it. No-op for clean failures / exhausted retries.
 * Returns the scheduled instant, or null if not scheduled.
 */
export async function scheduleRunRetryIfTransient(
  run: Pick<AgentRun, "id" | "status" | "retryCount">,
  now: Date = new Date(),
): Promise<Date | null> {
  if (!shouldRetryRun(run.status, run.retryCount)) return null;
  const at = nextRetryAt(run.status, run.retryCount, now);
  if (!at) return null;
  await prisma.agentRun
    .update({
      where: { id: run.id },
      data: { scheduledRetryAt: at, retryReason: run.status },
    })
    .catch((err) => {
      // Don't silently swallow: a failed stamp means this timed-out run is never retried. Log so it's
      // visible; the stranded-work reconciler is the backstop that will re-dispatch it next tick.
      logError("run-retry", `failed to stamp scheduledRetryAt for run ${run.id}`, {
        error: String(err),
      });
    });
  return at;
}

/**
 * Promote every run whose scheduledRetryAt has passed into a fresh queued run (owner-preserving). Each
 * promotion: atomically CLAIMS the source row (clear scheduledRetryAt guarded by the observed value, so
 * two overlapping cron ticks can't double-promote), then creates a new queued AgentRun with
 * retryOfRunId lineage and retryCount+1. Returns how many runs were re-queued. Called from reap-stale-work.
 */
export async function promoteDueRunRetries(now: Date = new Date()): Promise<number> {
  const due = await prisma.agentRun.findMany({
    where: { scheduledRetryAt: { lte: now } },
    select: {
      id: true,
      workspaceId: true,
      agentId: true,
      taskId: true,
      kind: true,
      providerKey: true,
      retryCount: true,
      scheduledRetryAt: true,
      requestedByProfileId: true,
    },
    take: 200,
  });

  let promoted = 0;
  for (const run of due) {
    const observed = run.scheduledRetryAt;
    if (!observed) continue;
    // Claim: clear the schedule only if it still matches what we observed (optimistic concurrency).
    const claim = await prisma.agentRun.updateMany({
      where: { id: run.id, scheduledRetryAt: observed },
      data: { scheduledRetryAt: null },
    });
    if (claim.count === 0) continue; // another tick already promoted this one

    // A retry needs an agent + task to re-dispatch; skip (already cleared) if either is missing.
    if (!run.agentId || !run.taskId) continue;
    try {
      await prisma.agentRun.create({
        data: {
          workspaceId: run.workspaceId,
          agentId: run.agentId,
          taskId: run.taskId,
          kind: run.kind,
          providerKey: run.providerKey,
          status: "queued",
          retryOfRunId: run.id,
          retryCount: run.retryCount + 1,
          requestedByProfileId: run.requestedByProfileId,
        },
      });
      promoted++;
    } catch {
      // best-effort; a failed re-queue leaves the source cleared (won't spin) for manual recovery
    }
  }
  return promoted;
}
