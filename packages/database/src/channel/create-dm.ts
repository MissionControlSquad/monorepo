/**
 * @agentcenter/database - Channel Operations
 *
 * Create a direct message (DM) channel between two profiles.
 */

import { prisma } from "../client";
import { ChannelVisibility, ChannelMemberRole } from "@agentcenter/utils";

export async function createDmChannel(
  creatorProfileId: string,
  otherProfileId: string,
  slug: string,
) {
  return prisma.channel.create({
    data: {
      name: "Direct message",
      slug,
      visibility: ChannelVisibility.DM,
      projectId: null,
      createdByProfileId: creatorProfileId,
      members: {
        create: [
          { profileId: creatorProfileId, role: ChannelMemberRole.CREATOR },
          { profileId: otherProfileId, role: ChannelMemberRole.MEMBER },
        ],
      },
    },
    select: { id: true, slug: true },
  });
}
