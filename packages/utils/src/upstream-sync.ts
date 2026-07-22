// Cloud upstream sync planning (parity #24, pure half). Given the local and remote head shas plus the
// ahead/behind counts a git host reports, decide the sync state and the safe action. PURE — the actual
// fetch/merge/push is the infra-gated git operation; this decides what should happen.

export type UpstreamSyncState = "up_to_date" | "behind" | "ahead" | "diverged" | "unknown";
export type UpstreamSyncAction = "none" | "pull" | "push" | "reconcile";

export interface UpstreamComparison {
  localSha: string | null;
  remoteSha: string | null;
  ahead: number; // local commits not on remote
  behind: number; // remote commits not on local
}

export interface UpstreamSyncPlan {
  state: UpstreamSyncState;
  action: UpstreamSyncAction;
  /** True when the action can't run cleanly on its own (needs a merge/rebase decision). */
  needsReconcile: boolean;
  reason: string;
}

/**
 * Classify an upstream comparison into a sync state + recommended action:
 * - both sides unknown → unknown/none
 * - same sha or ahead=behind=0 → up_to_date/none
 * - behind only → pull
 * - ahead only → push
 * - both → diverged/reconcile (a merge or rebase decision is required first)
 */
export function planUpstreamSync(cmp: UpstreamComparison): UpstreamSyncPlan {
  if (!cmp.localSha && !cmp.remoteSha)
    return { state: "unknown", action: "none", needsReconcile: false, reason: "no refs known" };

  if (cmp.localSha && cmp.localSha === cmp.remoteSha)
    return { state: "up_to_date", action: "none", needsReconcile: false, reason: "same head" };

  const ahead = Math.max(0, cmp.ahead);
  const behind = Math.max(0, cmp.behind);

  if (ahead === 0 && behind === 0)
    return { state: "up_to_date", action: "none", needsReconcile: false, reason: "no divergence" };
  if (ahead > 0 && behind > 0)
    return {
      state: "diverged",
      action: "reconcile",
      needsReconcile: true,
      reason: `diverged: ${ahead} ahead, ${behind} behind`,
    };
  if (behind > 0)
    return { state: "behind", action: "pull", needsReconcile: false, reason: `${behind} behind` };
  return { state: "ahead", action: "push", needsReconcile: false, reason: `${ahead} ahead` };
}
