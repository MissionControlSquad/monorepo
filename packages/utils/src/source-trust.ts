/**
 * Source-trust + run review-state (Domain 8 G2 — make `requireUntrustedPrReview` real). Pure, shared
 * via @agentcenter/utils. When a low-trust/untrusted agent (or one whose trust profile explicitly
 * requires untrusted-PR review) produces run output, that output is QUARANTINED: it lands in a
 * `needs_review` state with a source-trust marker, and the ONLY path out is an explicit board
 * promotion. A standard/trusted agent's output is auto-`approved`. No I/O — the web service loads the
 * trust profile and stamps the AgentRun.
 */

import type { TrustLevel } from "./trust";

/** Review disposition of a run's output. */
export const RUN_REVIEW_STATES = [
  "approved", // trusted output — no board gate
  "needs_review", // quarantined — a board reviewer must promote it
  "changes_requested",
] as const;
export type RunReviewState = (typeof RUN_REVIEW_STATES)[number];

export function isRunReviewState(v: string): v is RunReviewState {
  return (RUN_REVIEW_STATES as readonly string[]).includes(v);
}

export interface SourceTrust {
  /** The trust preset in effect when the output was produced. */
  preset: "standard" | "low_trust_review";
  /** quarantined = must be promoted before it can flow into higher-trust context. */
  disposition: "trusted" | "quarantined";
  sourceAgentId?: string | null;
  sourceRunId?: string | null;
  /** Set when a board reviewer promotes a quarantined output out of review. */
  promotedByProfileId?: string | null;
}

export interface RunTrustInputs {
  trustLevel?: TrustLevel | null;
  requireUntrustedPrReview?: boolean | null;
  lowTrustContainment?: boolean | null;
}

/**
 * Pure: does this agent's output require board review before it can be accepted? True for an
 * untrusted/low-trust agent, for one under low-trust containment, or one whose profile explicitly
 * sets `requireUntrustedPrReview`. This is the predicate that finally CONSUMES the dead toggle.
 */
export function runRequiresReview(inputs: RunTrustInputs | null | undefined): boolean {
  if (!inputs) return false;
  return (
    inputs.trustLevel === "untrusted" ||
    inputs.trustLevel === "low" ||
    inputs.lowTrustContainment === true ||
    inputs.requireUntrustedPrReview === true
  );
}

/** Pure: the review-state a finished run's output should carry, given the agent's trust inputs. */
export function resolveRunReviewState(inputs: RunTrustInputs | null | undefined): RunReviewState {
  return runRequiresReview(inputs) ? "needs_review" : "approved";
}

/** Pure: the source-trust marker to stamp on a run's output. */
export function buildRunSourceTrust(
  inputs: RunTrustInputs | null | undefined,
  ctx: { agentId?: string | null; runId?: string | null },
): SourceTrust {
  const quarantined = runRequiresReview(inputs);
  return {
    preset: quarantined ? "low_trust_review" : "standard",
    disposition: quarantined ? "quarantined" : "trusted",
    sourceAgentId: ctx.agentId ?? null,
    sourceRunId: ctx.runId ?? null,
  };
}

/** Pure: a source-trust marker for a board-promoted output (disposition flips to trusted). */
export function buildPromotedSourceTrust(prev: SourceTrust | null, promotedByProfileId: string): SourceTrust {
  return {
    preset: prev?.preset ?? "low_trust_review",
    disposition: "trusted",
    sourceAgentId: prev?.sourceAgentId ?? null,
    sourceRunId: prev?.sourceRunId ?? null,
    promotedByProfileId,
  };
}

/** Pure: is this output still quarantined (must not flow into higher-trust reads)? */
export function isQuarantined(sourceTrust: SourceTrust | null | undefined): boolean {
  return sourceTrust?.disposition === "quarantined";
}
