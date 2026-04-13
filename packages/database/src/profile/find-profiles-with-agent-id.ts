/**
 * @agentcenter/database - Profile Operations
 *
 * Find profiles with agent IDs (for availability filtering).
 */

import { prisma } from "../client";
import { ProfileKind } from "@agentcenter/utils";

export async function findProfilesWithAgentId(profileIds: string[]) {
  return prisma.profile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, agentId: true },
  });
}

export async function findAgentsUnavailableByIds(
  agentIds: string[],
  unavailableWhere: object,
) {
  return prisma.agent.findMany({
    where: { id: { in: agentIds }, ...unavailableWhere },
    select: { id: true },
  });
}

export async function getHumanUserIdsFromProfileIds(profileIds: string[]): Promise<string[]> {
  if (!profileIds.length) return [];
  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds }, kind: ProfileKind.HUMAN },
    select: { userId: true },
  });
  return profiles.filter((p) => p.userId).map((p) => p.userId!);
}

export async function findProfilesWithAgentIds(
  profileIds: string[],
  onlyWithAgentId = true,
) {
  return prisma.profile.findMany({
    where: {
      id: { in: profileIds },
      ...(onlyWithAgentId ? { agentId: { not: null } } : {}),
    },
    select: { agentId: true },
  });
}
