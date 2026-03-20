/**
 * @agentcenter/database - Profile Operations
 *
 * Resolve a profile's linked agent ID.
 * Returns null if the profile does not exist or has no linked agent.
 */

import { prisma } from "../client";

export async function getProfileAgentId(profileId: string): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { agentId: true },
  });
  return profile?.agentId ?? null;
}
