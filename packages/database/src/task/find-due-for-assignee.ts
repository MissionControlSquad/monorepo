/**
 * @agentcenter/database - Task Operations
 *
 * Find tasks with due dates for a specific assignee.
 */

import { prisma } from "../client";
import { TaskStatus } from "@agentcenter/utils";

export async function findTasksDueForAssignee(profileId: string, dueBy: Date) {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: TaskStatus.DONE },
      dueDate: { not: null, lte: dueBy },
      assignees: { some: { profileId } },
    },
    select: { id: true, title: true, dueDate: true },
  });
}
