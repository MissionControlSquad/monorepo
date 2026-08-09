/**
 * Task watchdogs + recovery (Epic #8). A watchdog watches a task for a stall condition and, when it
 * holds, records a WatchdogDecision and performs its action (recorded as a TaskRecoveryAction).
 * Recovery is idempotent — it dedupes on an already-open recovery action for the task.
 */
import { prisma } from "@/server/prisma";
import type {
  TaskWatchdog,
  WatchdogScope,
  WatchdogCondition,
  WatchdogActionType,
  WatchdogDecision,
} from "@agentcenter/database";
import { isLeaseExpired } from "./task-checkout";
import { forceReleaseCheckout } from "./task-checkout";
import { holdSubtree } from "./task-tree-hold";

export async function createWatchdog(args: {
  taskId: string;
  scope?: WatchdogScope;
  condition: WatchdogCondition;
  thresholdSec: number;
  action: WatchdogActionType;
}): Promise<TaskWatchdog> {
  return prisma.taskWatchdog.create({
    data: {
      taskId: args.taskId,
      scope: args.scope ?? "task",
      condition: args.condition,
      thresholdSec: args.thresholdSec,
      action: args.action,
    },
  });
}

/** Pure: does the watchdog's condition currently hold? Implements lease_expired + no_heartbeat. */
export function conditionHolds(
  condition: WatchdogCondition,
  task: { checkedOutByProfileId: string | null; checkoutLeaseExpiresAt: Date | null },
  now: Date,
  ctx?: { thresholdSec?: number; agentLastHeartbeat?: Date | null },
): boolean {
  switch (condition) {
    case "lease_expired":
      return task.checkedOutByProfileId != null && isLeaseExpired(task.checkoutLeaseExpiresAt, now);
    case "no_heartbeat": {
      // The task is claimed but the owning agent has gone silent past the threshold. A null
      // heartbeat is treated as "can't confirm death" (defers to lease_expired) to avoid releasing
      // a freshly-claimed task from an agent that simply hasn't reported yet.
      if (task.checkedOutByProfileId == null) return false;
      const hb = ctx?.agentLastHeartbeat ?? null;
      if (hb == null) return false;
      return now.getTime() - hb.getTime() > (ctx?.thresholdSec ?? 0) * 1000;
    }
    // no_progress / stuck_in_status still need richer signals — deferred, report false.
    default:
      return false;
  }
}

async function performAction(
  action: WatchdogActionType,
  taskId: string,
): Promise<{ ok: boolean; resolution: string }> {
  switch (action) {
    case "release_checkout":
      await forceReleaseCheckout(taskId);
      return { ok: true, resolution: "checkout released" };
    case "pause_subtree":
      await holdSubtree(taskId, "watchdog: auto-pause on stall");
      return { ok: true, resolution: "subtree held" };
    case "notify":
    case "escalate":
      return { ok: true, resolution: `${action} recorded` };
    case "reassign":
      return { ok: true, resolution: "reassign requested" };
    default:
      return { ok: false, resolution: "no handler" };
  }
}

/**
 * Evaluate every enabled watchdog whose task's condition currently holds; fire recovery once per
 * task (dedupes on an open recovery action). Returns the decisions recorded.
 */
export async function evaluateWatchdogs(now: Date = new Date()): Promise<WatchdogDecision[]> {
  const watchdogs = await prisma.taskWatchdog.findMany({
    where: { isEnabled: true },
    include: {
      task: {
        select: { id: true, checkedOutByProfileId: true, checkoutLeaseExpiresAt: true },
      },
    },
  });

  // For no_heartbeat we need the owning agent's last heartbeat: profileId → agent.lastHeartbeat.
  const profileIds = [
    ...new Set(watchdogs.map((w) => w.task.checkedOutByProfileId).filter((v): v is string => !!v)),
  ];
  const heartbeatByProfile = new Map<string, Date | null>();
  if (profileIds.length) {
    const profiles = await prisma.profile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, agent: { select: { lastHeartbeat: true } } },
    });
    for (const p of profiles) heartbeatByProfile.set(p.id, p.agent?.lastHeartbeat ?? null);
  }

  const decisions: WatchdogDecision[] = [];
  for (const wd of watchdogs) {
    const agentLastHeartbeat = wd.task.checkedOutByProfileId
      ? (heartbeatByProfile.get(wd.task.checkedOutByProfileId) ?? null)
      : null;
    if (
      !conditionHolds(wd.condition, wd.task, now, {
        thresholdSec: wd.thresholdSec,
        agentLastHeartbeat,
      })
    )
      continue;

    // Idempotency: skip if this task already has an open recovery action.
    const open = await prisma.taskRecoveryAction.findFirst({
      where: { taskId: wd.taskId, status: { in: ["detected", "attempting"] } },
      select: { id: true },
    });
    if (open) continue;

    const recovery = await prisma.taskRecoveryAction.create({
      data: {
        taskId: wd.taskId,
        detectedBy: wd.id,
        reason: `watchdog:${wd.condition}`,
        status: "attempting",
        attemptedAt: now,
      },
    });
    const result = await performAction(wd.action, wd.taskId);
    await prisma.taskRecoveryAction.update({
      where: { id: recovery.id },
      data: {
        status: result.ok ? "resolved" : "failed",
        resolution: result.resolution,
        resolvedAt: now,
      },
    });
    const decision = await prisma.watchdogDecision.create({
      data: {
        watchdogId: wd.id,
        taskId: wd.taskId,
        outcome: result.ok ? "action_taken" : "action_failed",
        reason: `${wd.condition} → ${wd.action}: ${result.resolution}`,
      },
    });
    decisions.push(decision);
  }
  return decisions;
}
