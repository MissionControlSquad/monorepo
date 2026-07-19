/**
 * Stranded-work reconciliation (Domain 9 #8) — the "don't let remote work sit dead forever" ladder.
 * A task whose latest run failed/timed-out, with no run queued/running and no pending retry, is
 * STRANDED. The reconciler (run from the reap cron) re-dispatches it ONCE (owner-preserving — same
 * agent, same task), and if a re-dispatch also fails it escalates the task to `blocked` and records a
 * TaskRecoveryAction. Bounded + idempotent: an in-flight recovery leaves a queued run so the task is
 * no longer "stranded" on the next tick, and a blocked task drops out of the candidate set.
 */
import { prisma } from "@/server/prisma";
import { enqueueSandboxRun } from "./sandbox-run";
import { TaskStatus } from "../constants";

const RECOVERY_REASON = "stranded_work";
/** How many automatic re-dispatch attempts before escalating a stranded task to blocked. */
const MAX_RECOVERY_ATTEMPTS = 1;

interface StrandedResult {
  redispatched: number;
  escalated: number;
}

/**
 * Reconcile stranded assigned work. Returns counts of tasks re-dispatched vs escalated-to-blocked.
 * Safe to call every reap tick; owner-preserving (never reassigns).
 */
export async function reconcileStrandedWork(now: Date = new Date()): Promise<StrandedResult> {
  // Candidate runs: a terminal transient/hard failure that is NOT already pending a scheduled retry.
  // Newest-first so we consider each task's most recent outcome; dedupe by task in code.
  const failedRuns = await prisma.agentRun.findMany({
    where: {
      status: { in: ["failed", "timeout"] },
      scheduledRetryAt: null,
      kind: "sandbox",
      taskId: { not: null },
      agentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, workspaceId: true, taskId: true, agentId: true, createdAt: true },
    take: 500,
  });

  const seenTask = new Set<string>();
  let redispatched = 0;
  let escalated = 0;

  for (const run of failedRuns) {
    const taskId = run.taskId!;
    if (seenTask.has(taskId)) continue; // only the latest failure per task
    seenTask.add(taskId);

    // If any run for this task is queued/running, work is (already) in flight — not stranded.
    const inFlight = await prisma.agentRun.count({
      where: { taskId, status: { in: ["queued", "running"] } },
    });
    if (inFlight > 0) continue;

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS] },
      },
      select: { id: true, checkoutLeaseExpiresAt: true },
    });
    if (!task) continue; // terminal / deleted / not actionable

    // A live (non-expired) checkout means someone is actively working it — leave it.
    if (task.checkoutLeaseExpiresAt && task.checkoutLeaseExpiresAt > now) continue;

    // Only a sandbox-capable agent can be re-dispatched.
    const agent = await prisma.agent.findFirst({
      where: { id: run.agentId!, workspaceId: run.workspaceId },
      select: { id: true, sandboxProvider: true, environmentId: true },
    });
    if (!agent || (!agent.sandboxProvider && !agent.environmentId)) continue;

    const priorAttempts = await prisma.taskRecoveryAction.count({
      where: { taskId, reason: RECOVERY_REASON },
    });

    if (priorAttempts < MAX_RECOVERY_ATTEMPTS) {
      // First recovery: re-dispatch once, owner-preserving.
      try {
        await enqueueSandboxRun({
          workspaceId: run.workspaceId,
          taskId,
          agentId: agent.id,
        });
        await prisma.taskRecoveryAction.create({
          data: {
            taskId,
            detectedBy: "cron",
            reason: RECOVERY_REASON,
            status: "attempting",
            attemptCount: priorAttempts + 1,
            attemptedAt: now,
            resolution: "redispatched",
          },
        });
        redispatched++;
      } catch {
        // enqueue can reject (inadmissible target); skip — a later tick or manual recovery handles it
      }
    } else {
      // A recovery already ran and it is STILL stranded → escalate to blocked (owner unchanged).
      await prisma.$transaction([
        prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.BLOCKED } }),
        prisma.taskRecoveryAction.create({
          data: {
            taskId,
            detectedBy: "cron",
            reason: RECOVERY_REASON,
            status: "failed",
            attemptCount: priorAttempts + 1,
            attemptedAt: now,
            resolvedAt: now,
            resolution: "escalated_to_blocked",
          },
        }),
      ]);
      escalated++;
    }
  }

  return { redispatched, escalated };
}
