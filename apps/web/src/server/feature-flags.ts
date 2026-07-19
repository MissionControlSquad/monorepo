import { listAllFeatureFlags } from "@agentcenter/database";
import { isFeatureLicensed, getLicenseStatus } from "./license";
import { LicenseStatusCode } from "./constants";

interface FlagEntry {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string | null;
}

let flagCache: Map<string, FlagEntry> | null = null;
let lastRefresh = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Effective cache TTL. Integration tests toggle flags constantly and share one process, so a live
 * cache goes stale relative to the DB and causes order-dependent flakiness. When DISABLE_FLAG_CACHE=1
 * (set by vitest.config.ts) every read hits the DB fresh. Prod keeps the 60s cache.
 */
function cacheTtl(): number {
  return process.env.DISABLE_FLAG_CACHE === "1" ? -1 : CACHE_TTL;
}

async function refreshCache(): Promise<Map<string, FlagEntry>> {
  const flags = await listAllFeatureFlags();
  const map = new Map<string, FlagEntry>();
  for (const f of flags) {
    map.set(f.key, {
      key: f.key,
      enabled: f.enabled,
      managedBy: f.managedBy,
      description: f.description,
    });
  }
  flagCache = map;
  lastRefresh = Date.now();
  return map;
}

export async function getFeatureFlags(): Promise<Map<string, FlagEntry>> {
  if (!flagCache || Date.now() - lastRefresh > cacheTtl()) {
    return refreshCache();
  }
  return flagCache;
}

/**
 * Check if a feature is enabled.
 * Double-gated: feature flag must be enabled AND license must include the feature.
 * If no license is configured (status "none"), only the flag check applies.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flagEnabled = flags.get(key)?.enabled ?? true;
  if (!flagEnabled) return false;

  // When no license is configured, rely only on the feature flag.
  const licenseStatus = await getLicenseStatus();
  if (licenseStatus.status === LicenseStatusCode.NONE) return true;

  // In development, skip license feature check — flag being enabled is enough.
  if (process.env.NODE_ENV === "development") return true;

  // License is present — check it allows this feature.
  const licensed = await isFeatureLicensed(key);
  return licensed;
}

export async function getAllFlags(): Promise<FlagEntry[]> {
  const flags = await getFeatureFlags();
  return Array.from(flags.values());
}

/** Force refresh on next access (call after infra updates flags via SQL). */
export function invalidateFlagCache(): void {
  flagCache = null;
  lastRefresh = 0;
}
