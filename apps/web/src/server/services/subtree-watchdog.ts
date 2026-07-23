import { createHash } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { TaskStatus } from "@/server/constants";
import type { SubtreeWatchdog } from "@agentcenter/database";

// Subtree verification watchdog (parity Domain-9 #9). A watchdog agent is assigned to a stopped task
// subtree; the reap cron wakes it ONLY when the subtree's stop-fingerprint changes, so an unchanged
// stopped subtree isn't re-reviewed forever. The fingerprint is a stable hash of the stopped leaves.
// Workspace-scoped. Waking the agent is the runtime seam; this owns the fingerprint + suppression.

const TERMINAL = new Set<string>([TaskStatus.DONE, TaskStatus.CANCELLED]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Walk a task subtree (parentTaskId edges) and return the leaves (tasks with no non-deleted children). */
async function subtreeLeaves(rootTaskId: string): Promise<{ id: string; status: string }[]> {
  const seen = new Set<string>();
  const leaves: { id: string; status: string }[] = [];
  let frontier = [rootTaskId];
  while (frontier.length) {
    const nodes = await prisma.task.findMany({
      where: { id: { in: frontier }, deletedAt: null },
      select: { id: true, status: true },
    });
    const next: string[] = [];
    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const children = await prisma.task.findMany({
        where: { parentTaskId: n.id, deletedAt: null },
        select: { id: true },
      });
      if (children.length === 0) leaves.push({ id: n.id, status: n.status });
      else next.push(...children.map((c) => c.id));
    }
    frontier = next;
  }
  return leaves;
}

/**
 * Pure: a stable fingerprint of a subtree's STOPPED state — the sorted (id,status) of terminal leaves.
 * When new work happens (a leaf changes status, a new leaf appears), the fingerprint changes.
 */
export function computeStopFingerprint(leaves: { id: string; status: string }[]): string {
  const stopped = leaves
    .filter((l) => TERMINAL.has(l.status))
    .map((l) => `${l.id}:${l.status}`)
    .sort();
  return createHash("sha256").update(stopped.join("|")).digest("hex");
}

/** True when every leaf of the subtree is terminal (the whole subtree has stopped). */
function allStopped(leaves: { id: string; status: string }[]): boolean {
  return leaves.length > 0 && leaves.every((l) => TERMINAL.has(l.status));
}

export async function armSubtreeWatchdog(input: {
  workspaceId: string;
  taskId: string;
  watchdogAgentProfileId?: string | null;
}): Promise<SubtreeWatchdog> {
  if (!input.taskId?.trim()) badRequest("taskId is required");
  // one active watchdog per task
  await prisma.subtreeWatchdog.updateMany({
    where: { workspaceId: input.workspaceId, taskId: input.taskId, active: true },
    data: { active: false },
  });
  return prisma.subtreeWatchdog.create({
    data: {
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      watchdogAgentProfileId: input.watchdogAgentProfileId ?? null,
    },
  });
}

/**
 * Reconcile an armed watchdog: compute the current stop-fingerprint; if the subtree has fully stopped
 * AND its fingerprint differs from the last reviewed one, signal a review (return shouldWake=true) and
 * record the new fingerprint. An unchanged or still-running subtree does not wake. The heartbeat calls
 * this per active watchdog.
 */
export async function reconcileSubtreeWatchdog(
  workspaceId: string,
  watchdogId: string,
): Promise<{ shouldWake: boolean; fingerprint: string; stopped: boolean }> {
  const wd = await prisma.subtreeWatchdog.findFirst({
    where: { id: watchdogId, workspaceId, active: true },
  });
  if (!wd) badRequest("Active watchdog not found");

  const leaves = await subtreeLeaves(wd.taskId);
  const fingerprint = computeStopFingerprint(leaves);
  const stopped = allStopped(leaves);

  const shouldWake = stopped && fingerprint !== wd.lastReviewedFingerprint;
  if (shouldWake) {
    await prisma.subtreeWatchdog.update({
      where: { id: wd.id },
      data: { lastReviewedFingerprint: fingerprint, lastReviewedAt: new Date() },
    });
  }
  return { shouldWake, fingerprint, stopped };
}

/**
 * Reconcile every active subtree watchdog (the heartbeat cron use). Returns how many were checked and
 * how many should wake their verification agent (a fully-stopped subtree whose fingerprint changed).
 * Waking the agent is the runtime seam; this drives the detection + suppression bookkeeping.
 */
export async function reconcileActiveSubtreeWatchdogs(): Promise<{
  checked: number;
  toWake: number;
}> {
  const active = await prisma.subtreeWatchdog.findMany({
    where: { active: true },
    select: { id: true, workspaceId: true },
  });
  let toWake = 0;
  for (const wd of active) {
    try {
      const res = await reconcileSubtreeWatchdog(wd.workspaceId, wd.id);
      if (res.shouldWake) toWake++;
    } catch {
      // best-effort per watchdog — one bad row must not abort the sweep
    }
  }
  return { checked: active.length, toWake };
}

export async function disarmSubtreeWatchdog(workspaceId: string, taskId: string): Promise<boolean> {
  const { count } = await prisma.subtreeWatchdog.updateMany({
    where: { workspaceId, taskId, active: true },
    data: { active: false },
  });
  return count > 0;
}
