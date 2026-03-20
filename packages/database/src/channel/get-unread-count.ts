/**
 * @agentcenter/database - Channel Operations
 *
 * Compute the number of unread messages for a channel member.
 * Uses lastReadAt if available, otherwise falls back to joinedAt.
 */

import { prisma } from "../client";

export async function getChannelUnreadCount(
  channelId: string,
  profileId: string,
): Promise<number> {
  const member = await prisma.channelMember.findUnique({
    where: { channelId_profileId: { channelId, profileId } },
    select: { lastReadAt: true, joinedAt: true },
  });
  if (!member) return 0;
  const since = member.lastReadAt ?? member.joinedAt;
  return prisma.channelMessage.count({
    where: { channelId, createdAt: { gt: since } },
  });
}
