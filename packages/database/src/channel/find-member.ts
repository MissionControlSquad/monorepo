/**
 * @agentcenter/database - Channel Operations
 *
 * Find a single channel member record.
 */

import { prisma } from "../client";
import type { ChannelMember } from "@prisma/client";

export async function findChannelMember(
  channelId: string,
  profileId: string,
): Promise<ChannelMember | null> {
  return prisma.channelMember.findUnique({
    where: { channelId_profileId: { channelId, profileId } },
  });
}
