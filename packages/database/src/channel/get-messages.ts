/**
 * @agentcenter/database - Channel Operations
 *
 * Retrieve messages for a channel with optional unread filtering.
 */

import { prisma } from "../client";

const PROFILE_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

export interface GetChannelMessagesOptions {
  limit?: number;
  /** If provided, return only messages created after this date (unread-only mode). */
  since?: Date;
}

export async function getChannelMessages(channelId: string, opts: GetChannelMessagesOptions = {}) {
  const { limit = 50, since } = opts;
  return prisma.channelMessage.findMany({
    where: {
      channelId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    include: {
      fromProfile: { select: PROFILE_SELECT },
      mentions: {
        include: { profile: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
