import { prisma } from "@/server/prisma";

/** Human profile username suffix to avoid clashing with agent usernames (Profile.username is unique). */
const HUMAN_USERNAME_SUFFIX = "_u";

/** Build same config from admin username: email, displayName, and profile username for public profile. */
function userAndProfileConfigFromAdmin(adminUsername: string) {
  const normalized = adminUsername.trim().toLowerCase().replace(/\s+/g, "_");
  return {
    email: `${normalized}@app.local`,
    displayName: adminUsername.trim(),
    profileUsername: `${normalized}${HUMAN_USERNAME_SUFFIX}`,
  };
}

/**
 * On admin login/setup: ensure a User exists (same config from admin), ensure a public Profile exists
 * for that User, and link AdminUser to User. Creates either or both if they don't exist.
 * Returns { userId, profileId }.
 */
export async function ensureUserAndProfileForAdmin(adminId: string, adminUsername: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { user: { include: { profile: true } } },
  });
  if (!admin) throw new Error("Admin not found");

  const config = userAndProfileConfigFromAdmin(adminUsername);

  // 1) Get or create User (same config: email from admin username)
  let user = admin.user ?? (await prisma.user.findUnique({ where: { email: config.email } }));
  if (!user) {
    user = await prisma.user.create({
      data: { email: config.email },
    });
  }

  // 2) Check for public profile (Profile) and create if it doesn't exist
  let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        kind: "human",
        displayName: config.displayName,
        username: config.profileUsername,
        userId: user.id,
      },
    });
  }

  // 3) Link admin to user if not already
  if (admin.userId !== user.id) {
    await prisma.adminUser.update({
      where: { id: adminId },
      data: { userId: user.id },
    });
  }

  return { userId: user.id, profileId: profile.id };
}
