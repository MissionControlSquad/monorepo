import { randomBytes, createHash } from "crypto";

const API_KEY_PREFIX = "mc_";
const RANDOM_BYTES = 32; // 64 hex chars

/**
 * Generate a new API key with its hash and display prefix.
 * The plain key is returned once — only the hash is stored.
 */
export function generateApiKey() {
  const hex = randomBytes(RANDOM_BYTES).toString("hex");
  const plainKey = `${API_KEY_PREFIX}${hex}`;
  const hash = hashApiKey(plainKey);
  const prefix = plainKey.slice(0, 12); // "mc_a1b2c3d4e"

  return { plainKey, hash, prefix };
}

/**
 * SHA-256 hash of an API key string (fast, deterministic, indexable).
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
