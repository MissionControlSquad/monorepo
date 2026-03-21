/**
 * @agentcenter/database - Task Operations
 *
 * Incrementally update task assignees — add some, remove some — in a single
 * atomic transaction. Unlike setTaskAssignees, this does not replace all
 * existing assignees.
 */

import { prisma } from "../client";

export async function diffTaskAssignees(
  taskId: string,
  addedProfileIds: string[],
  removedProfileIds: string[],
): Promise<void> {
  if (addedProfileIds.length === 0 && removedProfileIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    if (addedProfileIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: addedProfileIds.map((profileId) => ({ taskId, profileId })),
        skipDuplicates: true,
      });
    }
    if (removedProfileIds.length > 0) {
      await tx.taskAssignee.deleteMany({
        where: { taskId, profileId: { in: removedProfileIds } },
      });
    }
  });
}
