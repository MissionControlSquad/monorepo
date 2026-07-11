import type { Agent } from "@agentcenter/database";

export class TTLCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  /** Delete all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// --- Shared cache instances ---

// Auth caches (from phase 1)
export const agentCache = new TTLCache<Agent>(5 * 60); // 5 min
export const memberCache = new TTLCache<boolean>(10 * 60); // 10 min
export const projectIdsCache = new TTLCache<string[]>(10 * 60); // 10 min

// Agent list for @mention resolution
type AgentBasic = { id: string; name: string; username: string | null };
export const agentListCache = new TTLCache<AgentBasic[]>(5 * 60); // 5 min

// Project context (REST + GraphQL)
export const projectContextCache = new TTLCache<unknown>(10 * 60); // 10 min

// Task subscriber agentIds (notification handler)
export const subscriberCache = new TTLCache<string[]>(5 * 60); // 5 min

// Analytics / stats (TTL-only, no explicit invalidation)
export const profileStatsCache = new TTLCache<any>(5 * 60); // 5 min
export const statusCountsCache = new TTLCache<any>(5 * 60); // 5 min
export const workSummaryCache = new TTLCache<any>(5 * 60); // 5 min
export const productivityCache = new TTLCache<any>(10 * 60); // 10 min — expensive N+1
export const workloadCache = new TTLCache<any>(10 * 60); // 10 min — expensive N+1
export const cycleTimesCache = new TTLCache<any>(10 * 60); // 10 min — scans all done tasks
export const activityTrendCache = new TTLCache<any>(10 * 60); // 10 min — scans up to 5000 actions
export const heatmapCache = new TTLCache<any>(10 * 60); // 10 min — agent activity heatmap
export const transitionIdsCache = new TTLCache<{ id: string }[]>(5 * 60); // 5 min — DISTINCT ON scan
export const projectsListCache = new TTLCache<any>(5 * 60); // 5 min — projects with nested members

// Epic #4 budgets — short TTL: spend dashboards tolerate ~1 min staleness; breach
// enforcement is real-time via QuotaWindow rows, not these read caches.
export const costBreakdownCache = new TTLCache<any>(60); // 1 min — grouped spend aggregate
export const costTrendCache = new TTLCache<any>(60); // 1 min — daily spend trend
export const financeSummaryCache = new TTLCache<any>(60); // 1 min — totals + utilization

// Epic #16 business ledger — short TTL; invalidated per-workspace on every mutation.
export const ledgerSummaryCache = new TTLCache<any>(60);
export const ledgerByKindCache = new TTLCache<any>(60);
export const ledgerByBillerCache = new TTLCache<any>(60);
export const ledgerByCategoryCache = new TTLCache<any>(60);
export const ledgerTimelineCache = new TTLCache<any>(60);

/** Clear all ledger aggregate caches (called after any ledger mutation; low write volume). */
export function invalidateLedger(): void {
  ledgerSummaryCache.clear();
  ledgerByKindCache.clear();
  ledgerByBillerCache.clear();
  ledgerByCategoryCache.clear();
  ledgerTimelineCache.clear();
}

// --- Invalidation helpers ---

export function invalidateAgentCache(apiKeyHash: string) {
  agentCache.delete(apiKeyHash);
}

export function invalidateMemberCaches(projectId: string, agentId: string) {
  memberCache.delete(`${projectId}:${agentId}`);
  projectIdsCache.delete(agentId);
}

export function invalidateAgentListCache() {
  agentListCache.clear();
}

export function invalidateProjectContext(projectId: string) {
  projectContextCache.delete(projectId);
}

export function invalidateSubscribers(taskId: string) {
  subscriberCache.delete(taskId);
}

export function invalidateTransitionIds() {
  transitionIdsCache.clear();
}

export function invalidateProjectsList() {
  projectsListCache.clear();
}
