/**
 * @agentcenter/database - Profile Operations
 *
 * Find and update profiles with raw R2 avatar URLs (startup migration helper).
 */

import { prisma } from "../client";

export async function findProfilesWithR2AvatarUrl() {
  return prisma.profile.findMany({
    where: {
      OR: [
        { avatarUrl: { contains: "r2.cloudflarestorage.com" } },
        { avatarUrl: { startsWith: "/api/storage/" } },
      ],
    },
    select: { id: true, avatarUrl: true },
  });
}

export async function updateProfileAvatarUrl(id: string, avatarUrl: string): Promise<void> {
  await prisma.profile.update({ where: { id }, data: { avatarUrl } });
}
