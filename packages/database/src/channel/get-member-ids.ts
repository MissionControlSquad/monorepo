/**
 * @agentcenter/database - Channel Operations
 *
 * Get all profile IDs that are members of a channel.
 */

import { prisma } from "../client";

export async function getChannelMemberIds(channelId: string): Promise<string[]> {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: { profileId: true },
  });
  return members.map((m) => m.profileId);
}
