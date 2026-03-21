/**
 * @agentcenter/database - Channel Operations
 *
 * Find a channel by its slug.
 */

import { prisma } from "../client";

export async function findChannelBySlug(slug: string) {
  return prisma.channel.findUnique({
    where: { slug },
    select: { id: true, slug: true, visibility: true },
  });
}
