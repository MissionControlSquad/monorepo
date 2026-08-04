/**
 * Work-product taxonomy (Domain 8 G1) — pure, shared via @agentcenter/utils. A work product is a
 * run's produced OUTPUT (a pull request, branch, commit, preview URL, runtime service) as opposed to
 * authored content (markdown/code/file/link). It carries a review-state gate, a lifecycle status
 * machine, and a single canonical primary per (task, kind). No I/O.
 */

/** DeliverableKinds that are execution OUTPUTS (vs authored content). */
export const WORK_PRODUCT_KINDS = [
  "pull_request",
  "branch",
  "commit",
  "preview_url",
  "runtime_service",
] as const;
export type WorkProductKind = (typeof WORK_PRODUCT_KINDS)[number];

export function isWorkProductKind(kind: string): kind is WorkProductKind {
  return (WORK_PRODUCT_KINDS as readonly string[]).includes(kind);
}

/** Board review gate on an output. */
export const WORK_PRODUCT_REVIEW_STATES = [
  "none",
  "needs_review",
  "approved",
  "changes_requested",
] as const;
export type WorkProductReviewState = (typeof WORK_PRODUCT_REVIEW_STATES)[number];

export function isWorkProductReviewState(v: string): v is WorkProductReviewState {
  return (WORK_PRODUCT_REVIEW_STATES as readonly string[]).includes(v);
}

/** Output lifecycle status. */
export const WORK_PRODUCT_STATUSES = [
  "draft",
  "active",
  "ready_for_review",
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "failed",
  "archived",
] as const;
export type WorkProductStatus = (typeof WORK_PRODUCT_STATUSES)[number];

export function isWorkProductStatus(v: string): v is WorkProductStatus {
  return (WORK_PRODUCT_STATUSES as readonly string[]).includes(v);
}

export const WORK_PRODUCT_PROVIDERS = ["paperclip", "github", "vercel", "s3", "custom"] as const;

/** Legal output-status transitions (a DAG toward a terminal). */
const STATUS_TRANSITIONS: Record<WorkProductStatus, WorkProductStatus[]> = {
  draft: ["active", "ready_for_review", "closed", "archived"],
  active: ["ready_for_review", "closed", "failed", "archived"],
  ready_for_review: ["approved", "changes_requested", "closed", "archived"],
  approved: ["merged", "closed", "archived"],
  changes_requested: ["ready_for_review", "active", "closed", "archived"],
  merged: ["archived"],
  closed: ["archived"],
  failed: ["active", "archived"],
  archived: [],
};

/** Pure: is a status transition legal? An identity transition is always allowed (idempotent set). */
export function canTransitionWorkProductStatus(
  from: string | null | undefined,
  to: string,
): boolean {
  if (!isWorkProductStatus(to)) return false;
  if (!from) return true; // first assignment
  if (from === to) return true;
  if (!isWorkProductStatus(from)) return false;
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Pure: the initial review-state + status a newly-created work product should carry, given whether the
 * producing run was quarantined (low-trust — ties to Domain 8 G2 source-trust). A quarantined output
 * lands `needs_review`; a trusted one starts `none`/`active`.
 */
export function initialWorkProductGate(quarantined: boolean): {
  reviewState: WorkProductReviewState;
  outputStatus: WorkProductStatus;
} {
  return quarantined
    ? { reviewState: "needs_review", outputStatus: "ready_for_review" }
    : { reviewState: "none", outputStatus: "active" };
}
