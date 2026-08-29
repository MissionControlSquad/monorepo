import { getBuildbase, isBuildbaseConfigured } from "./tenancy/buildbase";
import { FLAG_KEYS, FLAG_DEFAULTS } from "@agentcenter/utils";

/**
 * Feature entitlements — buildbase is the SINGLE source of truth. A feature is enabled when the tenant
 * workspace's plan (buildbase `workspace.features[slug]`) includes it; slug == FLAG_KEYS value. Unknown
 * slug ⇒ not entitled (false).
 *
 * The former local `feature_flags` table + self-host license feature-gate have been removed (buildbase
 * cutover). Tests drive entitlement through the setTestFeature seam below instead of the DB table.
 */

export interface FlagEntry {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string | null;
}

// ── buildbase workspace entitlements ───────────────────────────────────────
let bbFeatures: { map: Record<string, boolean>; at: number } | null = null;
const BB_TTL = 60_000; // 1 minute

/**
 * The current tenant workspace's buildbase feature map. Read directly on session-bearing (HTTP)
 * requests; session-less contexts (WS / background dispatch, where buildbase's cookie auth is
 * unavailable) reuse the most recent map warmed by an HTTP request. `TENANT_WORKSPACE_ID` pins the
 * single workspace per tenant. Unknown slug ⇒ not entitled (false).
 */
async function getBuildbaseFeatures(): Promise<Record<string, boolean>> {
  // Buildbase-LESS deployment (self-host / CI with no buildbase org): fall back to the shipped
  // FLAG_DEFAULTS (core features on, opt-in features off) rather than "everything off" — a workspace
  // with no plan to read from should still get the product's default surface. When buildbase IS
  // configured it stays the single source of truth below.
  if (!isBuildbaseConfigured()) return FLAG_DEFAULTS;
  const bb = getBuildbase();
  const workspaceId = process.env.TENANT_WORKSPACE_ID?.trim();
  if (!bb || !workspaceId) return bbFeatures?.map ?? FLAG_DEFAULTS;
  const ttl = process.env.DISABLE_FLAG_CACHE === "1" ? -1 : BB_TTL;
  if (!bbFeatures || Date.now() - bbFeatures.at > ttl) {
    try {
      const ws = await bb.workspace.get(workspaceId);
      bbFeatures = { map: ws.features ?? {}, at: Date.now() };
    } catch {
      // Session-less context (background/WS) or a transient error: reuse the HTTP-warmed map, or the
      // shipped defaults on a cold start. buildbase remains the source of truth when a request warms it.
    }
  }
  return bbFeatures?.map ?? FLAG_DEFAULTS;
}

// ── Test seam ───────────────────────────────────────────────────────────────
// Under NODE_ENV=test, entitlement is driven by explicit per-test overrides, DEFAULTING TO ON so suites
// that don't touch flags see every feature enabled (matching the pre-buildbase default). Production
// ignores this entirely and reads buildbase. Replaces the former `prisma.featureFlag` table that tests
// wrote to: `upsert({key, enabled})` → `setTestFeature(key, enabled)`; `delete({key})` →
// `resetTestFeature(key)` (back to the default-ON).
const IS_TEST = process.env.NODE_ENV === "test";
const testOverrides = new Map<string, boolean>();

/**
 * Env force-on override for buildbase-LESS environments (CI e2e, self-host without a buildbase org).
 * buildbase stays the source of truth wherever it is configured; this only fills the gap where there is
 * no buildbase workspace to read a plan from — otherwise every feature would be off (empty feature map).
 * Comma-separated FLAG_KEYS slugs, e.g. FEATURE_FLAGS_ON="runners,memory". Read at call time.
 */
export function isForcedOn(key: string): boolean {
  const raw = process.env.FEATURE_FLAGS_ON;
  if (!raw) return false;
  return raw.split(",").some((s) => s.trim() === key);
}

export function setTestFeature(key: string, enabled: boolean): void {
  testOverrides.set(key, enabled);
}
export function resetTestFeature(key: string): void {
  testOverrides.delete(key);
}
export function resetTestFeatures(): void {
  testOverrides.clear();
}

/** Check if a feature is enabled for the current tenant workspace. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (IS_TEST) return testOverrides.get(key) ?? true;
  if (isForcedOn(key)) return true;
  const features = await getBuildbaseFeatures();
  return features[key] === true;
}

/** Every known flag with its current entitlement state (client feature map + admin views). */
export async function getAllFlags(): Promise<FlagEntry[]> {
  const map = IS_TEST ? null : await getBuildbaseFeatures();
  return Object.values(FLAG_KEYS).map((key) => ({
    key,
    enabled: IS_TEST ? (testOverrides.get(key) ?? true) : isForcedOn(key) || map![key] === true,
    managedBy: "system" as const,
    description: null,
  }));
}

/** Force a refresh of the buildbase entitlement cache on next read (called after a plan change). */
export function invalidateFlagCache(): void {
  bbFeatures = null;
}
