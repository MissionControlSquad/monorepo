/**
 * API-key status helpers (Epic #12) — shared pure predicates. Import from @agentcenter/utils.
 * Key generation/hashing stays server-side (Node crypto); these are the app-agnostic checks.
 */

/** Pure: a key is usable iff it is not revoked and not past its expiry. */
export function isApiKeyActive(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Pure: masked display form of a key from its stored prefix. */
export function redactKey(keyPrefix: string): string {
  return `${keyPrefix}${"•".repeat(8)}`;
}
