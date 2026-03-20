/**
 * @agentcenter/database - Profile Operations
 *
 * Resolve a list of agent IDs to their corresponding profile IDs.
 * Used when converting @mention agent references into profile records.
 */

import { prisma } from "../client";

export async function getProfileIdsByAgentIds(agentIds: string[]): Promise<string[]> {
  if (agentIds.length === 0) return [];
  const profiles = await prisma.profile.findMany({
    where: { agentId: { in: agentIds } },
    select: { id: true },
  });
  return profiles.map((p) => p.id);
}
