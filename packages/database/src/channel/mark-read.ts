/**
 * @agentcenter/database - Channel Operations
 *
 * Update a channel member's lastReadAt timestamp.
 */

import { prisma } from "../client";
import type { ChannelMember } from "@prisma/client";

export async function markChannelRead(
  channelId: string,
  profileId: string,
  at: Date = new Date(),
): Promise<ChannelMember> {
  return prisma.channelMember.update({
    where: { channelId_profileId: { channelId, profileId } },
    data: { lastReadAt: at },
  });
}
