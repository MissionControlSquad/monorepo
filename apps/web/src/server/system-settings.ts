import { prisma } from "./prisma";

const SINGLETON_ID = "global";

export async function isSystemShutdown(): Promise<boolean> {
  const row = await prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, shutdownActive: false },
    update: {},
  });
  return row.shutdownActive;
}

export async function setSystemShutdown(active: boolean): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, shutdownActive: active },
    update: { shutdownActive: active },
  });
}

export async function isProjectShutdown(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { shutdownActive: true },
  });
  return project?.shutdownActive ?? false;
}

export async function setProjectShutdown(projectId: string, active: boolean): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { shutdownActive: active },
  });
}

/**
 * Throws if the project is archived or shutdown. Use before any write operation
 * that targets a specific project (task creation, recurring tasks, channels, etc.).
 */
export async function assertProjectWritable(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, shutdownActive: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.status === "archived") {
    throw new Error("This project is archived. No modifications allowed.");
  }
  if (project.shutdownActive) {
    throw new Error("This project is paused. No new tasks or modifications allowed.");
  }
}
