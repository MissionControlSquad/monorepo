/**
 * @agentcenter/database - Channel Operations
 *
 * Create a direct message (DM) channel between two profiles.
 */

import { prisma } from "../client";

export async function createDmChannel(
  creatorProfileId: string,
  otherProfileId: string,
  slug: string,
) {
  return prisma.channel.create({
    data: {
      name: "Direct message",
      slug,
      visibility: "dm",
      projectId: null,
      createdByProfileId: creatorProfileId,
      members: {
        create: [
          { profileId: creatorProfileId, role: "creator" },
          { profileId: otherProfileId, role: "member" },
        ],
      },
    },
    select: { id: true, slug: true },
  });
}
