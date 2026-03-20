/**
 * @agentcenter/database - Channel Operations
 *
 * Retrieve channel membership data (with lastReadAt) and recent unread messages
 * for SSE stream bootstrapping. Returns raw data — callers filter by time.
 */

import { prisma } from "../client";

const PROFILE_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

export async function getChannelStreamData(profileId: string) {
  const memberships = await prisma.channelMember.findMany({
    where: { profileId },
    select: { channelId: true, lastReadAt: true, joinedAt: true },
  });

  const messagesByChannel = await Promise.all(
    memberships.map(async (m) => {
      const since = m.lastReadAt ?? m.joinedAt;
      const messages = await prisma.channelMessage.findMany({
        where: {
          channelId: m.channelId,
          createdAt: { gt: since },
          fromProfileId: { not: profileId },
        },
        include: { fromProfile: { select: PROFILE_SELECT } },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return { channelId: m.channelId, messages };
    }),
  );

  return { memberships, messagesByChannel };
}
