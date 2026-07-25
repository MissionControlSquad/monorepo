/**
 * @agentcenter/database - Project Operations
 *
 * Get project status fields.
 */

import { prisma } from "../client";

export async function getProjectStatus(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, shutdownActive: true, name: true },
  });
}

/** Resolve the buildbase workspace id for a project. Null if unassigned. */
export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  return project?.workspaceId ?? null;
}

export async function setProjectShutdownActive(projectId: string, active: boolean): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { shutdownActive: active },
  });
}
