/**
 * @agentcenter/database - Channel Operations
 *
 * List channels a profile is a member of, with their members and last message.
 * Optionally filter by channel visibility.
 */

import { prisma } from "../client";
import type { ChannelVisibility } from "@prisma/client";

const MEMBER_PROFILE_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

export async function listMemberChannels(profileId: string, visibility?: ChannelVisibility) {
  return prisma.channelMember.findMany({
    where: {
      profileId,
      ...(visibility ? { channel: { visibility } } : {}),
    },
    include: {
      channel: {
        include: {
          members: {
            include: {
              profile: { select: MEMBER_PROFILE_SELECT },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, content: true, fromProfileId: true, createdAt: true },
          },
        },
      },
    },
  });
}
