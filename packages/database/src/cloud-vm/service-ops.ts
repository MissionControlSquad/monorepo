/**
 * @agentcenter/database - Cloud VM Operations
 *
 * Additional service-level agent/VM operations.
 */

import { prisma } from "../client";

export async function findAgentsByVMId(vmId: string) {
  return prisma.agent.findMany({
    where: { cloudVmId: vmId },
    select: { username: true, name: true },
  });
}
