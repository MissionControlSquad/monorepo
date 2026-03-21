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

export async function setProjectShutdownActive(projectId: string, active: boolean): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { shutdownActive: active },
  });
}
