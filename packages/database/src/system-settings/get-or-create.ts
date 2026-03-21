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
