/**
 * @agentcenter/database - CloudVM Operations
 *
 * Find CloudVMs stuck in a setup/provisioning state past the timeout threshold.
 * Used by the deployment monitor cron job.
 */

import { prisma } from "../client";
import { CloudVmStatus } from "@agentcenter/utils";

const SETUP_STATUSES = [
  CloudVmStatus.PROVISIONING,
  CloudVmStatus.WAITING_FOR_SSH,
  CloudVmStatus.INSTALLING_DEPS,
  CloudVmStatus.INSTALLING_OPENCLAW,
  CloudVmStatus.CONFIGURING,
  CloudVmStatus.STARTING_SERVICE,
] as const;

export async function findStaleSetupCloudVMs(timeoutMs: number) {
  const threshold = new Date(Date.now() - timeoutMs);
  return prisma.cloudVM.findMany({
    where: {
      status: { in: [...SETUP_STATUSES] },
      updatedAt: { lt: threshold },
    },
  });
}
