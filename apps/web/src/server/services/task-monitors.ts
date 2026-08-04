/**
 * Issue monitors (Domain 9 #11) — a one-shot deferred "check back later" wake an agent arms while
 * working (e.g. "poll this GitHub check / deploy in 10 minutes"). When monitorNextCheckAt passes, the
 * reap cron re-dispatches the task's sandbox-bound assignee(s) and CLEARS the schedule (re-arm is
 * explicit — the agent must arm it again to be woken again), incrementing the attempt counter and
 * stopping at monitorMaxAttempts. Distinct from the workspace-health Monitor model and from the
 * automatic retry/stranded ladders.
 */
import { prisma } from "@/server/prisma";
import { getProfileAgentId } from "@agentcenter/database";
import { enqueueSandboxRun } from "./sandbox-run";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

const MAX_MONITOR_NOTES = 2_000;

/** Arm (or re-arm) a task's monitor. Workspace-scoped; the task must be actionable. */
export async function armTaskMonitor(input: {
  taskId: string;
  nextCheckAt: Date;
  notes?: string | null;
  maxAttempts?: number | null;
}): Promise<{ taskId: string; monitorNextCheckAt: Date | null }> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, deletedAt: null },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found");
  const updated = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      monitorNextCheckAt: input.nextCheckAt,
      monitorNotes: input.notes?.slice(0, MAX_MONITOR_NOTES) ?? null,
      ...(input.maxAttempts != null ? { monitorMaxAttempts: input.maxAttempts } : {}),
    },
    select: { id: true, monitorNextCheckAt: true },
  });
  return { taskId: updated.id, monitorNextCheckAt: updated.monitorNextCheckAt };
}

/** Clear a task's monitor (disarm). */
export async function clearTaskMonitor(taskId: string): Promise<void> {
  await prisma.task
    .update({ where: { id: taskId }, data: { monitorNextCheckAt: null } })
    .catch(() => {});
}

/**
 * Fire every due monitor: re-dispatch the task's sandbox-bound assignee(s), clear the one-shot
 * schedule, and bump the attempt counter. A monitor at/over its maxAttempts is disarmed without firing
 * (exhausted). Returns the number of monitors fired. Called from reap-stale-work. RUNNERS-gated.
 */
export async function tickDueTaskMonitors(now: Date = new Date()): Promise<number> {
  if (!(await isFeatureEnabled(FLAG_KEYS.RUNNERS))) return 0;

  const due = await prisma.task.findMany({
    where: { monitorNextCheckAt: { lte: now }, deletedAt: null },
    select: {
      id: true,
      monitorNextCheckAt: true,
      monitorAttemptCount: true,
      monitorMaxAttempts: true,
      assignees: { select: { profileId: true } },
    },
    take: 200,
  });

  let fired = 0;
  for (const task of due) {
    const observed = task.monitorNextCheckAt;
    if (!observed) continue;

    // Optimistic claim: clear the one-shot schedule only if it still matches (no double-fire across
    // overlapping cron ticks). Whether or not we ultimately dispatch, the monitor is consumed.
    const claim = await prisma.task.updateMany({
      where: { id: task.id, monitorNextCheckAt: observed },
      data: { monitorNextCheckAt: null },
    });
    if (claim.count === 0) continue;

    // Exhausted budget → disarm without firing (schedule already cleared above).
    if (task.monitorMaxAttempts != null && task.monitorAttemptCount >= task.monitorMaxAttempts) {
      continue;
    }

    // Re-dispatch each sandbox-bound assignee that has no in-flight run.
    let dispatched = false;
    for (const { profileId } of task.assignees) {
      const agentId = await getProfileAgentId(profileId);
      if (!agentId) continue; // human assignee
      const agent = await prisma.agent.findFirst({
        where: { id: agentId },
        select: { sandboxProvider: true, environmentId: true, workspaceId: true },
      });
      if (!agent?.workspaceId || (!agent.sandboxProvider && !agent.environmentId)) continue;
      const active = await prisma.agentRun.findFirst({
        where: { taskId: task.id, agentId, status: { in: ["queued", "running"] } },
        select: { id: true },
      });
      if (active) continue;
      try {
        await enqueueSandboxRun({ workspaceId: agent.workspaceId, taskId: task.id, agentId });
        dispatched = true;
      } catch {
        // inadmissible target — skip this assignee
      }
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { monitorAttemptCount: { increment: 1 } },
    });
    if (dispatched) fired++;
  }
  return fired;
}
