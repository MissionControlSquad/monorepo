/**
 * @agentcenter/database - Channel Operations
 *
 * Fetch data needed for channel message notification dispatch.
 */

import { prisma } from "../client";

export async function getChannelVisibility(channelId: string) {
  return prisma.channel.findUnique({
    where: { id: channelId },
    select: { visibility: true, slug: true },
  });
}

export async function getChannelMessageForNotify(messageId: string) {
  return prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      channelId: true,
      content: true,
      fromProfileId: true,
      createdAt: true,
      fromProfile: {
        select: { id: true, kind: true, displayName: true, username: true, avatarUrl: true },
      },
    },
  });
}

export async function getMessageMentionedProfileIds(messageId: string): Promise<string[]> {
  const mentions = await prisma.channelMessageMention.findMany({
    where: { messageId },
    select: { profileId: true },
  });
  return mentions.map((m) => m.profileId);
}

export async function getChannelAgentMembers(channelId: string, excludeProfileId: string) {
  return prisma.channelMember.findMany({
    where: {
      channelId,
      profileId: { not: excludeProfileId },
      profile: { kind: "agent" },
    },
    select: {
      profileId: true,
      profile: { select: { agentId: true } },
    },
  });
}

export async function getChannelHumanMembers(channelId: string, excludeProfileId: string) {
  return prisma.channelMember.findMany({
    where: {
      channelId,
      profileId: { not: excludeProfileId },
      profile: { kind: "human" },
    },
    select: {
      profileId: true,
      profile: { select: { userId: true } },
    },
  });
}
