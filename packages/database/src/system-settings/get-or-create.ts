/**
 * @agentcenter/database - System Settings Operations
 *
 * Get or create the global system settings singleton.
 */

import { prisma } from "../client";

const SINGLETON_ID = "global";

export async function getOrCreateSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, shutdownActive: false },
    update: {},
  });
}

export async function setSystemShutdownActive(active: boolean): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, shutdownActive: active },
    update: { shutdownActive: active },
  });
}

// ── Onboarding ────────────────────────────────────────────────────

export interface OnboardingProgress {
  completed: boolean;
  /** The selected use-case category (e.g. "solo-founder", "dev-team") */
  categoryId: string | null;
}

export async function getOnboardingProgress(): Promise<OnboardingProgress> {
  const row = await getOrCreateSystemSettings();
  return {
    completed: row.onboardingCompleted,
    categoryId: row.onboardingCategoryId,
  };
}

export async function setOnboardingCategory(categoryId: string): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, onboardingCategoryId: categoryId },
    update: { onboardingCategoryId: categoryId },
  });
}

export async function completeOnboarding(): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      onboardingCompleted: true,
      onboardingCategoryId: null,
    },
    update: {
      onboardingCompleted: true,
      onboardingCategoryId: null,
    },
  });
}
