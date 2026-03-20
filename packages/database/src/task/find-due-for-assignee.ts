/**
 * @agentcenter/database - Task Operations
 *
 * Find tasks with due dates for a specific assignee.
 */

import { prisma } from "../client";

export async function findTasksDueForAssignee(profileId: string, dueBy: Date) {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "done" },
      dueDate: { not: null, lte: dueBy },
      assignees: { some: { profileId } },
    },
    select: { id: true, title: true, dueDate: true },
  });
}
