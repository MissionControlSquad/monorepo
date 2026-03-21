/**
 * @agentcenter/database - Recurring Task Operations
 *
 * Query and update recurring tasks for task generation.
 */

import { prisma } from "../client";

export async function findRecurringTaskOrThrow(id: string) {
  return prisma.recurringTask.findUniqueOrThrow({
    where: { id },
    include: { assignees: true },
  });
}

export async function findDueRecurringTasks(where: Record<string, unknown>) {
  return prisma.recurringTask.findMany({
    where,
    include: { assignees: true },
  });
}

export async function advanceRecurringTaskDueAt(
  id: string,
  nextDueAt: Date,
  lastGeneratedAt: Date,
): Promise<void> {
  await prisma.recurringTask.update({
    where: { id },
    data: { nextDueAt, lastGeneratedAt },
  });
}
