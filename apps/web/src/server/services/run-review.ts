/**
 * Run review-state (Domain 8 G2) — the untrusted-output quarantine + board promotion for AgentRun.
 * Makes the previously-dead `requireUntrustedPrReview` trust toggle real: at run finalization a
 * low-trust/untrusted agent's output is stamped `needs_review` + a quarantined sourceTrust marker;
 * the only path out is `promoteAgentRunReview` (board/admin). LOW_TRUST_REVIEW-flag gated at the edge.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import {
  resolveRunReviewState,
  buildRunSourceTrust,
  buildPromotedSourceTrust,
  isRunReviewState,
  type RunReviewState,
  type SourceTrust,
  type RunTrustInputs,
} from "@agentcenter/utils";

/**
 * Compute the review-state + source-trust marker a finished run should carry, from the agent's trust
 * profile. Pure delegation to the shared helpers; kept here so the run seam has one call. Returns null
 * when there are no trust inputs AND the agent is standard (nothing to stamp) — callers may skip.
 */
export function computeRunReview(
  inputs: RunTrustInputs | null,
  ctx: { agentId?: string | null; runId?: string | null },
): { reviewState: RunReviewState; sourceTrust: SourceTrust } {
  return {
    reviewState: resolveRunReviewState(inputs),
    sourceTrust: buildRunSourceTrust(inputs, ctx),
  };
}

/** Persist the review-state + source-trust marker onto a finished run (best-effort at the run seam). */
export async function stampRunReview(
  runId: string,
  inputs: RunTrustInputs | null,
  ctx: { agentId?: string | null },
): Promise<void> {
  const { reviewState, sourceTrust } = computeRunReview(inputs, { agentId: ctx.agentId, runId });
  await prisma.agentRun
    .update({
      where: { id: runId },
      data: { reviewState, sourceTrust: sourceTrust as never },
    })
    .catch(() => {});
}

/**
 * Board/admin promotes (or requests changes on) a quarantined run's output. Only a run currently in
 * `needs_review` can be promoted; promotion flips the sourceTrust disposition to trusted and records
 * the reviewer. Workspace-scoped. Returns the updated run.
 */
export async function promoteAgentRunReview(input: {
  workspaceId: string;
  runId: string;
  decision: RunReviewState; // "approved" | "changes_requested"
  reviewedByProfileId: string;
}) {
  if (!isRunReviewState(input.decision) || input.decision === "needs_review")
    throw new GraphQLError("decision must be 'approved' or 'changes_requested'", {
      extensions: { code: "BAD_USER_INPUT" },
    });

  const run = await prisma.agentRun.findFirst({
    where: { id: input.runId, workspaceId: input.workspaceId },
    select: { id: true, reviewState: true, sourceTrust: true },
  });
  if (!run) throw new GraphQLError("Run not found", { extensions: { code: "NOT_FOUND" } });
  if (run.reviewState !== "needs_review")
    throw new GraphQLError("Only a run awaiting review can be promoted", {
      extensions: { code: "BAD_USER_INPUT" },
    });

  const prev = (run.sourceTrust ?? null) as SourceTrust | null;
  const sourceTrust =
    input.decision === "approved"
      ? buildPromotedSourceTrust(prev, input.reviewedByProfileId)
      : prev; // changes_requested keeps the quarantine until a new run supersedes it

  return prisma.agentRun.update({
    where: { id: run.id },
    data: {
      reviewState: input.decision,
      sourceTrust: (sourceTrust ?? undefined) as never,
      reviewedByProfileId: input.reviewedByProfileId,
      reviewedAt: new Date(),
    },
  });
}
