/** @agentcenter/database - Profile Mutation Operations
 * Update and query helpers for profiles.
 */

import { prisma } from "../client";

/** Update a profile by id. Accepts Pothos query spread. */
export async function updateProfile(
  id: string,
  data: Record<string, unknown>,
  query?: Record<string, unknown>,
) {
  return prisma.profile.update({
    ...query,
    where: { id },
    data,
  });
}

/** Find a profile by id with kind check (for updateMyProfile mutation). */
export async function findProfileForUpdate(id: string) {
  return prisma.profile.findUnique({
    where: { id },
    select: { id: true, kind: true },
  });
}

/** Find profiles by an array of ids, with optional agent id filter. */
export async function findProfilesByIds(
  ids: string[],
  select?: Record<string, boolean>,
) {
  return prisma.profile.findMany({
    where: { id: { in: ids } },
    ...(select ? { select } : {}),
  });
}

/** Find profiles with agentId, filtered by profile ids. */
export async function findProfilesWithAgentIdsByIds(ids: string[]) {
  return prisma.profile.findMany({
    where: { id: { in: ids }, agentId: { not: null } },
    select: { agentId: true },
  });
}

/** Find a profile by id with agentId select. */
export async function findProfileAgentId(profileId: string) {
  return prisma.profile.findUnique({
    where: { id: profileId },
    select: { agentId: true },
  });
}

/** Find profiles with agentId only, filtered by profile ids (for mention agent id resolution). */
export async function findProfilesAgentIds(profileIds: string[]) {
  if (profileIds.length === 0) return [];
  return prisma.profile.findMany({
    where: { id: { in: profileIds } },
    select: { agentId: true },
  });
}

/** Find a profile with displayName and agentId for message event enrichment. */
export async function findProfileDisplayAndAgentId(profileId: string) {
  return prisma.profile.findUnique({
    where: { id: profileId },
    select: { displayName: true, agentId: true },
  });
}
