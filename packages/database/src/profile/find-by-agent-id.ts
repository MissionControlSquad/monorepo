/**
 * @agentcenter/database - Profile Operations
 *
 * Find a profile by its linked agent ID.
 */

import { prisma } from "../client";
import type { Profile } from "@prisma/client";

export async function findProfileByAgentId(agentId: string): Promise<Profile | null> {
  return prisma.profile.findUnique({ where: { agentId } });
}
