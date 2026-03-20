/**
 * @agentcenter/database - Task Operations
 *
 * Find a task by ID with a fully-typed select clause (excludes soft-deleted tasks).
 */

import { prisma, notDeleted } from "../client";
import type { Prisma } from "@prisma/client";

export async function findTaskByIdSelect<S extends Prisma.TaskSelect>(
  id: string,
  select: S,
): Promise<Prisma.TaskGetPayload<{ select: S }> | null> {
  return prisma.task.findFirst({
    where: { id, ...notDeleted },
    select,
  }) as Promise<Prisma.TaskGetPayload<{ select: S }> | null>;
}
