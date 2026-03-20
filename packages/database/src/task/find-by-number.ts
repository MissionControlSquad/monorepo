/**
 * @agentcenter/database - Task Operations
 *
 * Find a task by its sequential task number (excludes soft-deleted tasks).
 */

import { prisma, notDeleted } from "../client";
import type { Task, Prisma } from "@prisma/client";

export async function findTaskByNumber(
  taskNumber: number,
  args?: { include?: Prisma.TaskInclude },
): Promise<Task | null> {
  return prisma.task.findFirst({
    ...args,
    where: { taskNumber, ...notDeleted },
  });
}
