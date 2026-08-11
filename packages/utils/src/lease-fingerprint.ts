/**
 * Secret-version lease fingerprint (sandbox security hardening — Item 1). Pure + isomorphic.
 *
 * SAFETY: an environment lease is reused (its live machine re-attached) keyed on `environmentId` only.
 * If a secret the run depends on is ROTATED between runs, the kept machine still holds the STALE
 * credential — the next run would reuse it and execute with the old secret. To close that, we compute a
 * FINGERPRINT over the resolved secret VERSIONS a run depends on (the environment's config/envVars
 * secret-refs + the agent's secret bindings). The fingerprint is stored on the lease; reuse is gated on
 * it. When any dependency's version changes (a rotation bumps `currentVersion`), the fingerprint changes
 * → the old lease no longer matches → a FRESH machine is provisioned with the rotated credential.
 *
 * Pure: this file only turns a list of `{ key, version }` refs into a stable digest. The service layer
 * gathers the concrete versions (a DB read) and calls this — so the hashing logic stays unit-testable
 * with no I/O.
 */
import { sha256Hex } from "./package-integrity";

/** One secret dependency: a stable identity (secret id or name) + the concrete version in effect. */
export interface SecretVersionRef {
  /** Stable identity of the secret — its id (preferred) or name. */
  key: string;
  /** The resolved version number in effect for this run (bumps on rotation). */
  version: number;
}

/**
 * Pure: a stable, order-independent fingerprint over the secret versions a run depends on. Refs are
 * deduped (last write per key wins) and sorted so ordering never affects the digest. An EMPTY set
 * yields a fixed sentinel (`"sf1:none"`) so a no-secret environment still has a well-defined, matchable
 * fingerprint (rather than an empty-string edge case). Any version change flips the digest.
 */
export function fingerprintSecretVersions(refs: SecretVersionRef[]): string {
  const byKey = new Map<string, number>();
  for (const r of refs) {
    if (!r.key) continue;
    byKey.set(r.key, r.version);
  }
  if (byKey.size === 0) return "sf1:none";
  const canonical = [...byKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, version]) => `${key}@${version}`)
    .join("\n");
  // Prefix so the digest is recognizably a lease fingerprint (never collides with another sha use).
  return `sf1:${sha256Hex(canonical).slice(0, 32)}`;
}
