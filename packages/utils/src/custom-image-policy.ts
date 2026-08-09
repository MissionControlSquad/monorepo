/**
 * Tier D / Phase 3 (Plan 5) — PURE custom-image config fingerprint + change classification (ported
 * from Paperclip's environment-custom-image-runtime). DB-free + deterministic → unit-testable.
 *
 * A captured image is tied to the provider config it was built from. When that config later drifts we
 * classify the change so the runtime knows whether the existing image is still usable:
 *   none       — config identical → the image is exactly valid.
 *   relinkable — only NON-structural fields changed (region/env hints) → the image can be re-linked.
 *   breaking   — a STRUCTURAL field changed (provider or base image) → the image is invalid, recapture.
 */

/** Fields whose change invalidates a captured image (a new capture is required). */
const STRUCTURAL_FIELDS = ["provider", "image"] as const;

function canonical(obj: Record<string, unknown>, keys: readonly string[]): string {
  // Deterministic JSON over a fixed key set (sorted) — same config → same string, regardless of order.
  const picked: Record<string, unknown> = {};
  for (const k of [...keys].sort()) picked[k] = obj[k] ?? null;
  return JSON.stringify(picked);
}

/** A stable fingerprint of the STRUCTURAL provider config (what a captured image depends on). */
export function fingerprintProviderConfig(config: unknown): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  return canonical(cfg, STRUCTURAL_FIELDS);
}

/** A stable fingerprint of the FULL config (all keys) — for detecting any change at all. */
function fingerprintFullConfig(config: unknown): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  return canonical(cfg, Object.keys(cfg));
}

export type ConfigChangeClass = "none" | "relinkable" | "breaking";

export function classifyConfigChange(oldConfig: unknown, newConfig: unknown): ConfigChangeClass {
  if (fingerprintProviderConfig(oldConfig) !== fingerprintProviderConfig(newConfig)) {
    return "breaking";
  }
  if (fingerprintFullConfig(oldConfig) !== fingerprintFullConfig(newConfig)) {
    return "relinkable";
  }
  return "none";
}
