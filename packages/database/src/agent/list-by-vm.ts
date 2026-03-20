/**
 * @agentcenter/database - Agent Operations
 *
 * List agents assigned to a CloudVM.
 */

import { prisma } from "../client";

export async function listAgentsByVM(vmId: string) {
  return prisma.agent.findMany({
    where: { cloudVmId: vmId },
    select: {
      id: true,
      name: true,
      username: true,
      identityEmoji: true,
      status: true,
      role: true,
      apiKeyPrefix: true,
    },
  });
}
