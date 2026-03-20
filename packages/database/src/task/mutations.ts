/** @agentcenter/database - Task Mutation Operations
 * Transactional update operations for tasks (assignee diffs in a single transaction).
 */

import { prisma } from "../client";
import { notDeleted } from "../client";

/** Run a task update + assignee diff in a single transaction.
 * Returns the updated task.
 */
export async function runTaskUpdateTransaction(
  taskId: string,
  data: Record<string, unknown>,
  assigneeChanges: {
    addedProfileIds: string[];
    removedProfileIds: string[];
  } | null,
  query?: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      ...query,
      data,
    });

    if (assigneeChanges) {
      if (assigneeChanges.addedProfileIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: assigneeChanges.addedProfileIds.map((profileId) => ({ taskId, profileId })),
          skipDuplicates: true,
        });
      }
      if (assigneeChanges.removedProfileIds.length > 0) {
        await tx.taskAssignee.deleteMany({
          where: { taskId, profileId: { in: assigneeChanges.removedProfileIds } },
        });
      }
    }

    return updated;
  });
}

/** groupBy task status for task count query. */
export async function groupTasksByStatus(
  where: Record<string, unknown>,
) {
  return prisma.task.groupBy({
    by: ["status"],
    _count: { status: true },
    where: {
      ...notDeleted,
      ...where,
    },
  });
}
