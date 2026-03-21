/**
 * @agentcenter/database - CloudVM Operations
 *
 * Find CloudVMs stuck in a setup/provisioning state past the timeout threshold.
 * Used by the deployment monitor cron job.
 */

import { prisma } from "../client";

const SETUP_STATUSES = ["provisioning", "waiting_for_ssh", "installing_deps", "installing_openclaw", "configuring", "starting_service"] as const;

export async function findStaleSetupCloudVMs(timeoutMs: number) {
  const threshold = new Date(Date.now() - timeoutMs);
  return prisma.cloudVM.findMany({
    where: {
      status: { in: [...SETUP_STATUSES] },
      updatedAt: { lt: threshold },
    },
  });
}
