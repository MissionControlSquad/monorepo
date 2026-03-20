/**
 * @agentcenter/database - Task Operations
 *
 * Count active (non-done) task assignments for a profile.
 */

import { prisma, notDeleted } from "../client";

export async function countActiveTaskAssignmentsByProfile(profileId: string): Promise<number> {
  return prisma.taskAssignee.count({
    where: {
      profileId,
      task: { status: { notIn: ["done"] }, ...notDeleted },
    },
  });
}
