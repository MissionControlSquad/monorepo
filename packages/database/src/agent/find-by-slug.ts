/**
 * @agentcenter/database - Agent Operations
 *
 * Find an agent within a VM by username or name slug.
 */

import { prisma } from "../client";

export async function findAgentBySlug(vmId: string, slug: string) {
  return prisma.agent.findFirst({
    where: {
      cloudVmId: vmId,
      OR: [{ username: slug }, { name: slug }],
    },
  });
}
