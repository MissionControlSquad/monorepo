/**
 * Tier D: the MemoryAdapter abstraction + registry. Previously the provider was an inline `db`-vs-else
 * branch scattered across call-sites; this makes storage providers pluggable behind one interface
 * (append / search / forget / get) without touching callers. The default `db` adapter wraps the
 * existing control-plane memory service one-to-one - no behavior change, full back-compat.
 *
 * Least-privilege: every adapter method takes an explicit { workspaceId, agentId } scope, so a caller
 * can only ever touch memory it owns. The agent-facing tools (bridge) derive the scope from the
 * run-scoped token, never from client input, so one agent can never reach another agent's memory.
 *
 * OUT OF SCOPE (deferred): semantic/vector recall via pgvector. The db adapter keeps the existing
 * ILIKE substring recall; a future `pgvector` adapter registers here without changing any call-site.
 */
import type { AgentMemory } from "@agentcenter/database";
import type { MemoryProvider, MemorySourceKind } from "@agentcenter/utils";
import {
  appendAgentMemory,
  searchAgentMemory,
  forgetAgentMemory,
  getAgentMemory,
  recordMemoryOperation,
} from "./agent-memory";

/** The memory a call is allowed to touch. Always the caller's OWN workspace + agent (least-privilege). */
export interface MemoryScope {
  workspaceId: string;
  agentId: string;
}

/** Provenance to stamp on an appended entry (who/what produced it). */
export interface MemoryProvenance {
  taskId?: string | null;
  runId?: string | null;
  sourceKind?: MemorySourceKind | null;
  sourceRefId?: string | null;
}

/**
 * A pluggable memory storage provider. Capabilities: append (write an entry), search (recall by
 * query), forget (delete one entry), get (fetch one entry). Every method is scope-bound.
 */
export interface MemoryAdapter {
  readonly provider: MemoryProvider;
  append(scope: MemoryScope, content: string, provenance?: MemoryProvenance): Promise<AgentMemory>;
  search(scope: MemoryScope, query: string, limit?: number): Promise<AgentMemory[]>;
  forget(scope: MemoryScope, memoryId: string): Promise<boolean>;
  get(scope: MemoryScope, memoryId: string): Promise<AgentMemory | null>;
}

/**
 * The default control-plane adapter. Delegates one-to-one to the existing agent-memory service so the
 * legacy path is preserved exactly (search/forget/get already record their own audit ops). append
 * additionally records a `capture` op with the caller-supplied provenance, attributed to the run
 * (`included_in_run`) so an in-run note's cost rolls into the run rather than double-billing.
 */
export const dbMemoryAdapter: MemoryAdapter = {
  provider: "db",
  async append(scope, content, provenance) {
    const entry = await appendAgentMemory({
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      content,
      sourceTaskId: provenance?.taskId ?? null,
      sourceKind: provenance?.sourceKind ?? (provenance?.runId ? "run" : "manual_note"),
      sourceRefId: provenance?.sourceRefId ?? provenance?.runId ?? null,
    });
    await recordMemoryOperation({
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      provider: "db",
      opType: "capture",
      taskId: provenance?.taskId ?? null,
      runId: provenance?.runId ?? null,
      subjectId: entry.id,
      sourceKind: provenance?.sourceKind ?? (provenance?.runId ? "run" : "manual_note"),
      sourceRefId: provenance?.sourceRefId ?? provenance?.runId ?? null,
      resultCount: 1,
      attributionMode: "included_in_run",
    }).catch(() => {});
    return entry;
  },
  search(scope, query, limit) {
    return searchAgentMemory(scope.workspaceId, scope.agentId, query, limit);
  },
  forget(scope, memoryId) {
    return forgetAgentMemory(scope.workspaceId, scope.agentId, memoryId);
  },
  get(scope, memoryId) {
    return getAgentMemory(scope.workspaceId, scope.agentId, memoryId);
  },
};

// Provider name → adapter. Seeded with the default `db` adapter; future providers register here.
const registry = new Map<MemoryProvider, MemoryAdapter>([
  [dbMemoryAdapter.provider, dbMemoryAdapter],
]);

/** Register (or replace) the adapter for a provider. Future providers plug in without touching callers. */
export function registerMemoryAdapter(adapter: MemoryAdapter): void {
  registry.set(adapter.provider, adapter);
}

/**
 * Resolve the adapter for a provider, or null when the provider has no control-plane storage
 * (`none`/`markdown` store nothing control-plane-side, so there's no adapter to hand back).
 */
export function resolveMemoryAdapter(provider: MemoryProvider): MemoryAdapter | null {
  return registry.get(provider) ?? null;
}
