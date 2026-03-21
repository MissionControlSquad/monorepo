/**
 * @agentcenter/database - Profile Operations
 *
 * Find a profile's public display fields by ID.
 */

import { prisma } from "../client";

export async function findProfileForDisplay(id: string) {
  return prisma.profile.findUnique({
    where: { id },
    select: { id: true, kind: true, displayName: true, username: true, avatarUrl: true },
  });
}
