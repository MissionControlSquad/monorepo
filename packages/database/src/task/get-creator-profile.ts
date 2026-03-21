/**
 * @agentcenter/database - Task Operations
 *
 * Get the creator profile info for a task.
 */

import { prisma } from "../client";

export async function getTaskCreatorProfile(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdByProfile: {
        select: { userId: true, kind: true },
      },
    },
  });
  return task?.createdByProfile ?? null;
}

export async function getTaskProjectId(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  return task?.projectId ?? null;
}
