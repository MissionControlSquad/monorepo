/**
 * @agentcenter/database - Password Reset Token Operations
 *
 * CRUD for password reset tokens.
 */

import { prisma } from "../client";

export async function createPasswordResetTokenRecord(data: {
  tokenHash: string;
  adminUserId: string;
  createdById: string;
  expiresAt: Date;
}): Promise<void> {
  await prisma.passwordResetToken.create({ data });
}

/**
 * Atomically consume a reset token. Returns { adminUserId } on success, null on failure.
 * Uses updateMany with usedAt: null condition to prevent race conditions.
 */
export async function consumePasswordResetTokenRecord(
  tokenHash: string,
  now: Date,
): Promise<{ adminUserId: string } | null> {
  const result = await prisma.passwordResetToken.updateMany({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });

  if (result.count === 0) return null;

  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { adminUserId: true },
  });

  return token ? { adminUserId: token.adminUserId } : null;
}

/**
 * Invalidate all unused reset tokens for a user.
 */
export async function invalidatePasswordResetTokenRecords(adminUserId: string): Promise<void> {
  await prisma.passwordResetToken.updateMany({
    where: { adminUserId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
