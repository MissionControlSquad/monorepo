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
