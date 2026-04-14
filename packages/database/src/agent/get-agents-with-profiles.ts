/** @agentcenter/database - Fetch agents with their profile IDs. */

import { prisma } from "../client";

export type AgentWithProfile = {
  id: string;
  name: string;
  profile: { id: string } | null;
};

/**
 * Fetch multiple agents by ID, including their linked profile ID.
 * Used by mention-auto-assign to resolve profiles for new assignees.
 */
export async function getAgentsWithProfiles(agentIds: string[]): Promise<AgentWithProfile[]> {
  if (!agentIds.length) return [];
  return prisma.agent
    .findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, profile: { select: { id: true } } },
    })
    .catch(() => []);
}
