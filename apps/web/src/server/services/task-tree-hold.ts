/**
 * Task tree holds (Epic #8). An active hold on a subtree root pauses the whole subtree — checkout
 * and recurring generation must skip any task with a held ancestor. `isUnderHold` walks the
 * parentTaskId chain (capped) and checks for an active hold on self or any ancestor.
 */
import { prisma } from "@/server/prisma";
import type { TaskTreeHold } from "@agentcenter/database";

const MAX_DEPTH = 64;

/** Pure: is any id in the ancestor chain currently held? Unit-testable. */
export function anyHeld(chainIds: string[], heldIds: Set<string>): boolean {
  return chainIds.some((id) => heldIds.has(id));
}

/** Collect the task's id + all ancestor ids via parentTaskId (capped against cycles). */
async function ancestorChain(taskId: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = taskId;
  for (let i = 0; i < MAX_DEPTH && current; i++) {
    if (ids.includes(current)) break; // cycle guard
    ids.push(current);
    const row: { parentTaskId: string | null } | null = await prisma.task.findUnique({
      where: { id: current },
      select: { parentTaskId: true },
    });
    current = row?.parentTaskId ?? null;
  }
  return ids;
}

/** True when this task or any ancestor has an active tree hold. */
export async function isUnderHold(taskId: string): Promise<boolean> {
  const chain = await ancestorChain(taskId);
  if (chain.length === 0) return false;
  const held = await prisma.taskTreeHold.findFirst({
    where: { rootTaskId: { in: chain }, isActive: true },
    select: { id: true },
  });
  return held != null;
}

export async function holdSubtree(
  rootTaskId: string,
  reason: string,
  heldByProfileId?: string | null,
): Promise<TaskTreeHold> {
  // One hold row per root (unique); reactivate if a released hold exists.
  return prisma.taskTreeHold.upsert({
    where: { rootTaskId },
    create: { rootTaskId, reason, heldByProfileId: heldByProfileId ?? null, isActive: true },
    update: { reason, heldByProfileId: heldByProfileId ?? null, isActive: true, releasedAt: null },
  });
}

export async function releaseSubtreeHold(rootTaskId: string): Promise<boolean> {
  const res = await prisma.taskTreeHold.updateMany({
    where: { rootTaskId, isActive: true },
    data: { isActive: false, releasedAt: new Date() },
  });
  return res.count > 0;
}
