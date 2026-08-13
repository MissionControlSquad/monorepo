import { listAllFeatureFlags } from "@agentcenter/database";
import { isFeatureLicensed, getLicenseStatus } from "./license";
import { LicenseStatusCode } from "./constants";
import { getBuildbase } from "./tenancy/buildbase";

/**
 * Feature entitlements. TARGET STATE: buildbase is the single source of truth — a feature is enabled
 * when the workspace's plan (buildbase `workspace.features[slug]`) includes it. Slug == FLAG_KEYS value.
 *
 * CUTOVER: `USE_BUILDBASE_FEATURES=1` switches reads to buildbase. It ships OFF so features don't go
 * dark before every FLAG_KEYS slug exists in the buildbase plans; once configured + verified, flip it,
 * then the legacy DB/license path below (and the local feature_flags table + admin UI + infra seeding)
 * is deleted. This is a migration switch, NOT a runtime availability fallback.
 */
const USE_BUILDBASE_FEATURES = process.env.USE_BUILDBASE_FEATURES === "1";

// ---------------------------------------------------------------------------
// Target: buildbase workspace entitlements
// ---------------------------------------------------------------------------
let bbFeatures: { map: Record<string, boolean>; at: number } | null = null;
const BB_TTL = 60_000; // 1 minute

/**
 * The current tenant workspace's buildbase feature map. Read directly on session-bearing (HTTP)
 * requests; session-less contexts (WS / background dispatch, where buildbase's cookie auth is
 * unavailable) reuse the most recent map warmed by an HTTP request. `TENANT_WORKSPACE_ID` pins the
 * single workspace per tenant. Unknown slug ⇒ not entitled (false) — buildbase entitlement semantics.
 */
async function getBuildbaseFeatures(): Promise<Record<string, boolean>> {
  const bb = getBuildbase();
  const workspaceId = process.env.TENANT_WORKSPACE_ID?.trim();
  if (!bb || !workspaceId) return bbFeatures?.map ?? {};
  const ttl = process.env.DISABLE_FLAG_CACHE === "1" ? -1 : BB_TTL;
  if (!bbFeatures || Date.now() - bbFeatures.at > ttl) {
    try {
      const ws = await bb.workspace.get(workspaceId);
      bbFeatures = { map: ws.features ?? {}, at: Date.now() };
    } catch {
      // Session-less context (background/WS) or a transient error: reuse the HTTP-warmed map.
      // buildbase remains the source of truth; this only bridges contexts with no request cookie.
    }
  }
  return bbFeatures?.map ?? {};
}

// ---------------------------------------------------------------------------
// Legacy: local feature_flags table + self-host license (deleted after cutover)
// ---------------------------------------------------------------------------
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
 *
 * TARGET (USE_BUILDBASE_FEATURES): enabled ⇔ the workspace's buildbase plan includes the slug.
 * LEGACY: local feature_flags table AND (self-host license OR none/dev). Removed after cutover.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (USE_BUILDBASE_FEATURES) {
    const features = await getBuildbaseFeatures();
    return features[key] === true;
  }

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
  bbFeatures = null;
}
