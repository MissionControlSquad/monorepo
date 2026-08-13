/**
 * @agentcenter/database - first-owner provisioning for buildbase-only auth.
 *
 * Password login and the admin-creation setup flow are removed: buildbase is the only production auth.
 * To bootstrap operator ownership, the auth bridge calls this for the user buildbase reports as the
 * bound workspace's OWNER (hosted), or for the first authenticated user (self-host). It links that
 * User to a local AdminUser owner row. Idempotent + race-safe: once any AdminUser exists, it is a
 * no-op — so ordinary members (a Profile only) never become owners.
 *
 * The AdminUser row is an ownership/identity marker + session-revocation anchor only — it is NOT a
 * password credential (there is no login route that verifies it). Platform capability is still
 * governed by buildbase RBAC at each guard; this only records "an owner exists / who it is".
 */

import { prisma } from "../client";

// AdminUser.passwordHash is required by the schema but never used to authenticate anymore (no password
// login route exists). Store a sentinel that can never match a bcrypt verify.
const NO_PASSWORD_SENTINEL = "buildbase-owner-no-password-login";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function ownerUsername(seed: string): string {
  const base = seed.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_@.-]/g, "");
  return base || "owner";
}

/**
 * If no AdminUser exists yet, provision this user as the owner. Returns whether it provisioned.
 * @param userId  local User id (from the buildbase Profile upsert)
 * @param usernameSeed  a human-readable seed (email or name) for the owner's AdminUser.username
 */
export async function provisionFirstBuildbaseOwner(
  userId: string,
  usernameSeed: string,
): Promise<{ provisioned: boolean }> {
  if (!userId) return { provisioned: false };

  // Fast path: an owner already exists (the common case on every login after the first).
  const existing = await prisma.adminUser.count();
  if (existing > 0) return { provisioned: false };

  // This user is already the owner? (idempotent on repeat first-login before count settles)
  const already = await prisma.adminUser.findUnique({ where: { userId } });
  if (already) return { provisioned: false };

  try {
    await prisma.adminUser.create({
      data: {
        username: ownerUsername(usernameSeed),
        passwordHash: NO_PASSWORD_SENTINEL,
        userId,
      },
    });
    return { provisioned: true };
  } catch (err) {
    // Race: another concurrent first-login won (unique on username/userId), or an owner appeared
    // between the count and the create. Either way an owner now exists — treat as no-op.
    if (isUniqueViolation(err)) return { provisioned: false };
    throw err;
  }
}
