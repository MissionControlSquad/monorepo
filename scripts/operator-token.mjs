// Operator token model (parity — deployment/CLI §3, `token`). Pure crypto helpers that MIRROR the
// server token model in apps/web/src/server/api-key.ts (mc_ prefix, 32 random bytes, sha256 hash,
// plaintext shown once). Kept dependency-free (node:crypto only) so the CLI + tests use them without a
// build step; the same way scripts/operator.mjs mirrors env.ts. The DB-backed persistence (the ApiKey
// prisma model) is reused via apps/web/scripts/operator-token.ts — this module owns generation/verify.

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const TOKEN_PREFIX = "mc_";
const RANDOM_BYTES = 32; // 64 hex chars

/** SHA-256 hash of a token (fast, deterministic, indexable) — identical to server hashApiKey(). Pure. */
export function hashToken(key) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new operator/runner token: the plaintext (returned once), its sha256 hash (the only thing
 * stored), and a short display prefix. Mirrors server generateApiKey(). Inject `gen` for deterministic tests.
 */
export function generateToken(gen = randomBytes) {
  const hex = gen(RANDOM_BYTES).toString("hex");
  const plainKey = `${TOKEN_PREFIX}${hex}`;
  return { plainKey, hash: hashToken(plainKey), keyPrefix: plainKey.slice(0, 12) };
}

/** Constant-time verify of a plaintext token against a stored sha256 hash. Pure. */
export function verifyToken(plainKey, storedHash) {
  if (!plainKey || !storedHash) return false;
  const a = Buffer.from(hashToken(plainKey), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Masked display form of a token from its stored prefix (mirrors utils redactKey). Pure. */
export function redactToken(keyPrefix) {
  return `${keyPrefix}${"•".repeat(8)}`;
}
