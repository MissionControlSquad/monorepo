import { randomBytes, createHash } from "crypto";
import {
  createPasswordResetTokenRecord,
  consumePasswordResetTokenRecord,
  invalidatePasswordResetTokenRecords,
} from "@agentcenter/database";

const RESET_TOKEN_PREFIX = "reset_";
const RANDOM_BYTES = 32; // 64 hex chars
const TOKEN_EXPIRY_MINUTES = 30;

export function generateResetToken() {
  const hex = randomBytes(RANDOM_BYTES).toString("hex");
  const plainToken = `${RESET_TOKEN_PREFIX}${hex}`;
  const hash = hashResetToken(plainToken);
  return { plainToken, hash };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(targetAdminId: string, createdByAdminId: string) {
  const { plainToken, hash } = generateResetToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await createPasswordResetTokenRecord({
    tokenHash: hash,
    adminUserId: targetAdminId,
    createdById: createdByAdminId,
    expiresAt,
  });

  return { plainToken, expiresAt };
}

/**
 * Atomically consume a reset token. Returns { adminUserId } on success, null on failure.
 * Uses updateMany with usedAt: null condition to prevent race conditions.
 */
export async function consumeResetToken(
  plainToken: string,
): Promise<{ adminUserId: string } | null> {
  const hash = hashResetToken(plainToken);
  const now = new Date();

  return consumePasswordResetTokenRecord(hash, now);
}

/**
 * Invalidate all unused reset tokens for a user.
 * Called after any password change to prevent reuse.
 */
export async function invalidateAllResetTokens(adminUserId: string) {
  await invalidatePasswordResetTokenRecords(adminUserId);
}
