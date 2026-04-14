/** @agentcenter/database - Task assignee write operations and assignment checks. */

import { prisma } from "../client";
import { TaskStatus } from "@prisma/client";

/**
 * Check whether an agent (by agentId) is currently assigned to a task.
 */
export async function isAgentAssignedToTask(
  taskId: string,
  agentId: string,
): Promise<boolean> {
  const row = await prisma.taskAssignee
    .findFirst({
      where: { taskId, profile: { agentId } },
      select: { id: true },
    })
    .catch(() => null);
  return row !== null;
}

/**
 * Return the profileIds of all current assignees of a task.
 */
export async function getTaskAssigneeProfileIds(taskId: string): Promise<string[]> {
  const rows = await prisma.taskAssignee
    .findMany({ where: { taskId }, select: { profileId: true } })
    .catch(() => []);
  return rows.map((r) => r.profileId);
}

/**
 * Bulk-add profileIds as task assignees (non-destructive, skipDuplicates).
 */
export async function addTaskAssignees(
  taskId: string,
  profileIds: string[],
): Promise<void> {
  if (!profileIds.length) return;
  await prisma.taskAssignee
    .createMany({
      data: profileIds.map((profileId) => ({ taskId, profileId })),
      skipDuplicates: true,
    })
    .catch(() => undefined);
}

/**
 * Update a task's status field.
 */
export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  await prisma.task
    .update({ where: { id: taskId }, data: { status: status as TaskStatus } })
    .catch((err) => {
      console.error(`[database] Failed to update task ${taskId} status to ${status}:`, err);
    });
}
