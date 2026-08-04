// Memory injection ranking (parity Domain-4 F17/F18, offline half). PURE. The db memory provider
// currently injects the newest N entries verbatim; this ranks a larger candidate set by recency decay
// plus optional query-term overlap so the most relevant memories are injected, not just the most recent.
// No embeddings/vector index (that is the product-gated epic) — a transparent, testable heuristic.

export interface RankableMemory {
  id: string;
  content: string;
  createdAt: Date;
}

export interface MemoryRankOptions {
  now: number;
  /** Terms from the current task/context; overlap boosts a memory's score. */
  queryTerms?: string[];
  /** Recency half-life in ms (score halves each half-life of age). Default 7 days. */
  halfLifeMs?: number;
  /** Weight of term-overlap vs recency (0..1). Default 0.5. */
  relevanceWeight?: number;
}

const WORD = /[a-z0-9]{3,}/g;

function terms(text: string): Set<string> {
  return new Set(text.toLowerCase().match(WORD) ?? []);
}

/** Pure score in [0,1]: blends recency decay with query-term overlap (Jaccard). */
export function scoreMemory(memory: RankableMemory, opts: MemoryRankOptions): number {
  const halfLife = opts.halfLifeMs ?? 7 * 24 * 3_600_000;
  const w = opts.relevanceWeight ?? 0.5;

  const ageMs = Math.max(0, opts.now - memory.createdAt.getTime());
  const recency = Math.pow(0.5, ageMs / halfLife); // 1 at age 0, 0.5 at one half-life

  let relevance = 0;
  if (opts.queryTerms && opts.queryTerms.length) {
    const q = new Set(opts.queryTerms.map((t) => t.toLowerCase()));
    const m = terms(memory.content);
    let inter = 0;
    for (const t of q) if (m.has(t)) inter++;
    const union = q.size + m.size - inter;
    relevance = union > 0 ? inter / union : 0;
  }

  return opts.queryTerms?.length ? w * relevance + (1 - w) * recency : recency;
}

/**
 * Rank memories by score (desc) and return the top `limit`. Ties break toward the more recent entry so
 * the order is stable and deterministic.
 */
export function selectMemoriesForInjection<T extends RankableMemory>(
  memories: T[],
  limit: number,
  opts: MemoryRankOptions,
): T[] {
  return memories
    .map((m) => ({ m, s: scoreMemory(m, opts) }))
    .sort((a, b) => b.s - a.s || b.m.createdAt.getTime() - a.m.createdAt.getTime())
    .slice(0, Math.max(0, limit))
    .map((x) => x.m);
}
