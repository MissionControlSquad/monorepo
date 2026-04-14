/** @agentcenter/database - Task assignee lookup helpers for live-gateway delivery. */

import { prisma } from "../client";

/**
 * Return the agent IDs of every agent currently assigned to a task.
 */
export async function getTaskAssigneeAgentIds(taskId: string): Promise<string[]> {
  const rows = await prisma.taskAssignee
    .findMany({
      where: { taskId },
      select: { profile: { select: { agentId: true } } },
    })
    .catch(() => []);
  return rows.map((r) => r.profile?.agentId).filter(Boolean) as string[];
}

/**
 * From a candidate set of agent IDs, return the subset that are assigned to the task.
 * Used by mention delivery to distinguish assigned vs unassigned recipients.
 */
export async function getTaskAssignedSubset(taskId: string, agentIds: string[]): Promise<Set<string>> {
  if (!agentIds.length) return new Set();
  const rows = await prisma.taskAssignee
    .findMany({
      where: { taskId, profile: { agentId: { in: agentIds } } },
      select: { profile: { select: { agentId: true } } },
    })
    .catch(() => []);
  return new Set(rows.map((r) => r.profile?.agentId).filter(Boolean) as string[]);
}
