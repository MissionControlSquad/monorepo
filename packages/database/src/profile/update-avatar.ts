/**
 * @agentcenter/database - Profile Operations
 *
 * Update a profile's avatar URL.
 */

import { prisma } from "../client";
import type { Profile } from "@prisma/client";

export async function updateProfileAvatar(profileId: string, avatarUrl: string): Promise<Profile> {
  return prisma.profile.update({
    where: { id: profileId },
    data: { avatarUrl },
  });
}
