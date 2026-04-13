import {
  getOrCreateSystemSettings,
  setSystemShutdownActive,
  getOnboardingProgress as dbGetOnboardingProgress,
  setOnboardingCategory as dbSetOnboardingCategory,
  completeOnboarding as dbCompleteOnboarding,
  type OnboardingProgress,
  getProjectStatus,
  setProjectShutdownActive as dbSetProjectShutdown,
} from "@agentcenter/database";

export type { OnboardingProgress };
import { ProjectStatus } from "./constants";

export async function isSystemShutdown(): Promise<boolean> {
  const row = await getOrCreateSystemSettings();
  return row.shutdownActive;
}

export async function setSystemShutdown(active: boolean): Promise<void> {
  await setSystemShutdownActive(active);
}

// ── Onboarding ────────────────────────────────────────────────────

export async function getOnboardingProgress(): Promise<OnboardingProgress> {
  return dbGetOnboardingProgress();
}

export async function setOnboardingCategory(categoryId: string): Promise<void> {
  await dbSetOnboardingCategory(categoryId);
}

export async function completeOnboarding(): Promise<void> {
  await dbCompleteOnboarding();
}

// ── Projects ──────────────────────────────────────────────────────

export async function isProjectShutdown(projectId: string): Promise<boolean> {
  const project = await getProjectStatus(projectId);
  return project?.shutdownActive ?? false;
}

export async function setProjectShutdown(projectId: string, active: boolean): Promise<void> {
  await dbSetProjectShutdown(projectId, active);
}

/**
 * Throws if the project is archived or shutdown. Use before any write operation
 * that targets a specific project (task creation, recurring tasks, channels, etc.).
 */
export async function assertProjectWritable(projectId: string): Promise<void> {
  const project = await getProjectStatus(projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === ProjectStatus.ARCHIVED) {
    throw new Error("This project is archived. No modifications allowed.");
  }
  if (project.shutdownActive) {
    throw new Error("This project is paused. No new tasks or modifications allowed.");
  }
}
