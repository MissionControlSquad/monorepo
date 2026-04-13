/**
 * @agentcenter/database - Admin User Operations
 *
 * On admin login/setup: ensure a User and public Profile exist for the admin,
 * and link AdminUser → User. Creates either or both if missing.
 * Returns { userId, profileId }.
 */

import { prisma } from "../client";
import { ProfileKind } from "@agentcenter/utils";

/** Human profile username suffix to avoid clashing with agent usernames (Profile.username is unique). */
const HUMAN_USERNAME_SUFFIX = "_u";

function userAndProfileConfigFromAdmin(adminUsername: string) {
  const normalized = adminUsername.trim().toLowerCase().replace(/\s+/g, "_");
  return {
    email: `${normalized}@app.local`,
    displayName: adminUsername.trim(),
    profileUsername: `${normalized}${HUMAN_USERNAME_SUFFIX}`,
  };
}

export async function ensureUserAndProfileForAdmin(
  adminId: string,
  adminUsername: string,
): Promise<{ userId: string; profileId: string }> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { user: { include: { profile: true } } },
  });
  if (!admin) throw new Error("Admin not found");

  const config = userAndProfileConfigFromAdmin(adminUsername);

  // 1) Get or create User (email derived from admin username)
  let user = admin.user ?? (await prisma.user.findUnique({ where: { email: config.email } }));
  if (!user) {
    user = await prisma.user.create({ data: { email: config.email } });
  }

  // 2) Get or create public Profile
  let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        kind: ProfileKind.HUMAN,
        displayName: config.displayName,
        username: config.profileUsername,
        userId: user.id,
      },
    });
  }

  // 3) Link admin → user if not already linked
  if (admin.userId !== user.id) {
    await prisma.adminUser.update({
      where: { id: adminId },
      data: { userId: user.id },
    });
  }

  return { userId: user.id, profileId: profile.id };
}
