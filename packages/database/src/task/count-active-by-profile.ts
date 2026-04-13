/**
 * @agentcenter/database - Task Operations
 *
 * Count active (non-done) task assignments for a profile.
 */

import { prisma, notDeleted } from "../client";
import { TaskStatus } from "@agentcenter/utils";

export async function countActiveTaskAssignmentsByProfile(profileId: string): Promise<number> {
  return prisma.taskAssignee.count({
    where: {
      profileId,
      task: { status: { notIn: [TaskStatus.DONE] }, ...notDeleted },
    },
  });
}
