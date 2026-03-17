import { prisma } from "./prisma";
import { isFeatureLicensed } from "./license";

interface FlagEntry {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string | null;
}

let flagCache: Map<string, FlagEntry> | null = null;
let lastRefresh = 0;
const CACHE_TTL = 60_000; // 1 minute

async function refreshCache(): Promise<Map<string, FlagEntry>> {
  const flags = await prisma.featureFlag.findMany();
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
  if (!flagCache || Date.now() - lastRefresh > CACHE_TTL) {
    return refreshCache();
  }
  return flagCache;
}

/**
 * Check if a feature is enabled.
 * Double-gated: feature flag must be enabled AND license must include the feature.
 * If no license is configured (hosted mode), only the flag check applies.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flagEnabled = flags.get(key)?.enabled ?? true;
  if (!flagEnabled) return false;

  // Also check license allows this feature
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
