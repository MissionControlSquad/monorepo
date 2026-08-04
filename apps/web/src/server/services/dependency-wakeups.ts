import { prisma } from "@/server/prisma";
import { taskModel } from "@/server/models/task";
import { TaskStatus } from "@/server/constants";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

// Dependency wakeups (parity #1): when a blocker task reaches a terminal status (done/cancelled),
// wake the tasks it was blocking so an agent can pick them up — closing the autonomy gap where a
// blocked task otherwise sits in `blocked` forever. A task can be blocked two ways: the single
// `blockedByTaskId` field and any number of `TaskRelation` rows of type `blocks` (source blocks
// target). A task is only woken once ALL its blockers are terminal. TASK_AUTONOMY-gated.

const TERMINAL = new Set<string>([TaskStatus.DONE, TaskStatus.CANCELLED]);

type WakeCandidate = {
  id: string;
  taskNumber: number;
  title: string;
  projectId: string | null;
  blockedByTaskId: string | null;
};

const CANDIDATE_SELECT = {
  id: true,
  taskNumber: true,
  title: true,
  projectId: true,
  blockedByTaskId: true,
} as const;

/** Collect the statuses of every task blocking `task` — the `blockedByTaskId` edge + all `blocks` relations. */
async function blockerStatuses(task: WakeCandidate): Promise<string[]> {
  const statuses: string[] = [];

  if (task.blockedByTaskId) {
    const blocker = await prisma.task.findUnique({
      where: { id: task.blockedByTaskId },
      select: { status: true },
    });
    if (blocker) statuses.push(blocker.status);
  }

  const relations = await prisma.taskRelation.findMany({
    where: { targetTaskId: task.id, type: "blocks" },
    select: { sourceTask: { select: { status: true } } },
  });
  for (const rel of relations) statuses.push(rel.sourceTask.status);

  return statuses;
}

/**
 * Wake every task that was blocked by `completedTaskId` and now has all blockers terminal.
 * Returns the ids of the tasks woken (moved `blocked` → `inbox`). No-op unless TASK_AUTONOMY is on.
 */
export async function wakeDependentsOf(completedTaskId: string): Promise<string[]> {
  if (!(await isFeatureEnabled(FLAG_KEYS.TASK_AUTONOMY))) return [];

  // Candidates: blocked tasks pointed at completedTaskId via the field OR via a `blocks` relation.
  const [viaField, viaRelation] = await Promise.all([
    prisma.task.findMany({
      where: { blockedByTaskId: completedTaskId, status: TaskStatus.BLOCKED, deletedAt: null },
      select: CANDIDATE_SELECT,
    }),
    prisma.taskRelation.findMany({
      where: {
        sourceTaskId: completedTaskId,
        type: "blocks",
        targetTask: { status: TaskStatus.BLOCKED, deletedAt: null },
      },
      select: { targetTask: { select: CANDIDATE_SELECT } },
    }),
  ]);

  const candidates = new Map<string, WakeCandidate>();
  for (const t of viaField) candidates.set(t.id, t);
  for (const r of viaRelation) candidates.set(r.targetTask.id, r.targetTask);

  const woken: string[] = [];
  for (const task of candidates.values()) {
    const statuses = await blockerStatuses(task);
    // Wake only when every blocker is terminal (a task can have multiple blockers).
    if (!statuses.every((s) => TERMINAL.has(s))) continue;

    await prisma.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.INBOX, blockedByTaskId: null },
    });
    await taskModel.emitStatusChanged(task, {
      fromStatus: TaskStatus.BLOCKED,
      toStatus: TaskStatus.INBOX,
      changes: [{ field: "status", from: TaskStatus.BLOCKED, to: TaskStatus.INBOX }],
    });
    woken.push(task.id);
  }

  return woken;
}
