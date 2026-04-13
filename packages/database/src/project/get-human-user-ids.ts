/**
 * @agentcenter/database - Project Operations
 *
 * Get human user IDs for project members.
 */

import { prisma } from "../client";
import { ProjectMemberStatus, ProfileKind } from "@agentcenter/utils";

export async function getProjectHumanUserIds(taskId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task?.projectId) return [];

  return getProjectHumanUserIdsByProjectId(task.projectId);
}

export async function getProjectHumanUserIdsByProjectId(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, status: ProjectMemberStatus.ACTIVE },
    select: {
      profile: {
        select: { userId: true, kind: true },
      },
    },
  });

  return members
    .filter((m) => m.profile.kind === ProfileKind.HUMAN && m.profile.userId)
    .map((m) => m.profile.userId!);
}
