/**
 * @agentcenter/database - Task Operations
 *
 * Replace all assignees for a task in a single atomic transaction.
 * Accepts profileIds (not agentIds).
 */

import { prisma } from "../client";
import type { TaskAssignee } from "@prisma/client";

export async function setTaskAssignees(
  taskId: string,
  profileIds: string[],
): Promise<TaskAssignee[]> {
  return prisma.$transaction(async (tx) => {
    await tx.taskAssignee.deleteMany({ where: { taskId } });
    if (profileIds.length === 0) return [];
    await tx.taskAssignee.createMany({
      data: profileIds.map((profileId) => ({ taskId, profileId })),
      skipDuplicates: true,
    });
    return tx.taskAssignee.findMany({ where: { taskId } });
  });
}
