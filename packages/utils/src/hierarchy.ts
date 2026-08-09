/**
 * Generic hierarchy cycle detection — shared across all apps. Used by both the goal tree (#11) and the
 * agent org chart (#19) so the cycle logic exists once. Pure; returns a boolean (callers map to their
 * own error). Import from @agentcenter/utils.
 */
export interface HierarchyEdge {
  id: string;
  parentId: string | null;
}

/**
 * Would setting `id`'s parent to `parentId` create a cycle? True if `parentId === id` (self-parent) or
 * if `parentId` descends from `id` (walking ancestors up from `parentId` reaches `id`). Bounded even if
 * the stored tree already contains a cycle.
 */
export function wouldCreateCycle(
  edges: HierarchyEdge[],
  id: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  if (parentId === id) return true;
  const byId = new Map(edges.map((e) => [e.id, e.parentId]));
  let cursor: string | null | undefined = parentId;
  let guard = edges.length + 1;
  while (cursor && guard-- > 0) {
    if (cursor === id) return true;
    cursor = byId.get(cursor) ?? null;
  }
  return false;
}
