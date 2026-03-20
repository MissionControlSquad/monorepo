/**
 * @agentcenter/database - Task Operations
 *
 * Soft-delete a task by stamping its deletedAt timestamp.
 * The task remains in the database and is excluded from standard queries via notDeleted.
 */

import { prisma } from "../client";
import type { Task } from "@prisma/client";

export async function softDeleteTask(id: string): Promise<Task> {
  return prisma.task.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
