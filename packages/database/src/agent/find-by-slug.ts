/**
 * @agentcenter/database - Agent Operations
 *
 * Find an agent by username or name slug.
 */

import { prisma } from "../client";

export async function findAgentBySlug(slug: string) {
  return prisma.agent.findFirst({
    where: {
      OR: [{ username: slug }, { name: slug }],
    },
  });
}
