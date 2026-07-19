/**
 * Tier D: agent memory providers (the LAYER-2 binding value). Paperclip-style two-layer model —
 * the control plane owns which provider is bound per agent + provenance; the provider owns storage:
 *   • none     → stateless default; the runner holds nothing between tasks.
 *   • markdown → local files on the runner (para-memory-files analog); not stored control-plane-side.
 *   • db       → entries stored control-plane-side + injected into the per-task context.
 */
export const MEMORY_PROVIDERS = ["none", "markdown", "db"] as const;
export type MemoryProvider = (typeof MEMORY_PROVIDERS)[number];

export function isMemoryProvider(v: string): v is MemoryProvider {
  return (MEMORY_PROVIDERS as readonly string[]).includes(v);
}

/** Memory operation types recorded in the audit log (Domain 4 GAP-A). */
export const MEMORY_OP_TYPES = [
  "capture",
  "query",
  "list",
  "get",
  "forget",
  "correct",
  "record_upsert",
] as const;
export type MemoryOpType = (typeof MEMORY_OP_TYPES)[number];

/** Provenance kinds for a memory entry / operation. */
export const MEMORY_SOURCE_KINDS = [
  "run",
  "issue",
  "issue_comment",
  "issue_document",
  "activity",
  "manual_note",
  "external_document",
] as const;
export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];

/**
 * Pure: resolve the effective memory provider for an agent. Resolution order (Paperclip Decision 1):
 * agent override → company default → "none". An empty/invalid value at either layer falls through.
 * No per-project override in V1.
 */
export function resolveMemoryProvider(
  agentProvider: string | null | undefined,
  companyDefault: string | null | undefined,
): MemoryProvider {
  if (agentProvider && isMemoryProvider(agentProvider)) return agentProvider;
  if (companyDefault && isMemoryProvider(companyDefault)) return companyDefault;
  return "none";
}
