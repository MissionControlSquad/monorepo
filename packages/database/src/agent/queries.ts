/** @agentcenter/database - Agent Query Operations
 * Raw SQL and aggregate queries for agent analytics.
 */

import { prisma } from "../client";
import { TaskStatus } from "@agentcenter/utils";

/** Get the latest status history entry IDs (one per agent) via DISTINCT ON. */
export async function getLatestAgentActionIds(): Promise<{ id: string }[]> {
  return prisma.$queryRaw`
    SELECT DISTINCT ON ("agentId") id
    FROM status_history
    ORDER BY "agentId", timestamp DESC
  `;
}

/** Count active (non-done) task assignments for a profile. */
export async function countActiveTaskAssigneesByProfile(
  profileId: string,
  projectId?: string,
): Promise<number> {
  return prisma.taskAssignee.count({
    where: {
      profileId,
      ...(projectId ? { task: { projectId } } : {}),
    },
  });
}

/** Count completed task assignments for a profile. */
export async function countCompletedTaskAssigneesByProfile(
  profileId: string,
  projectId?: string,
): Promise<number> {
  return prisma.taskAssignee.count({
    where: {
      profileId,
      task: { status: TaskStatus.DONE, ...(projectId ? { projectId } : {}) },
    },
  });
}
