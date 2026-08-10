/**
 * Work-products service (Domain 8 G1). Manages execution OUTPUT deliverables (pull_request/branch/
 * commit/preview_url/runtime_service) with a review-state gate, a lifecycle status machine, and a
 * single canonical primary per (task, kind). Extends the Deliverable model rather than a new table.
 * Board reviewers approve/request-changes; an agent may create outputs but cannot self-approve.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import type { Deliverable, DeliverableKind } from "@agentcenter/database";
import {
  isWorkProductKind,
  isWorkProductReviewState,
  canTransitionWorkProductStatus,
  initialWorkProductGate,
  type WorkProductReviewState,
} from "@agentcenter/utils";
import { badRequest } from "./service-errors";

export interface CreateWorkProductInput {
  taskId: string;
  profileId: string; // author (agent or human)
  projectId?: string | null;
  kind: string; // must be a work-product kind
  title: string;
  url?: string | null;
  provider?: string | null;
  externalId?: string | null;
  createdByRunId?: string | null;
  /** The producing run was low-trust/quarantined → the output lands needs_review (Domain 8 G2). */
  quarantined?: boolean;
  makePrimary?: boolean;
}

/**
 * Create a work product for a task. When makePrimary (default true), demotes any prior primary of the
 * same (task, kind) in the same transaction so exactly one is canonical. The review gate is derived
 * from whether the producing run was quarantined.
 */
export async function createWorkProduct(input: CreateWorkProductInput): Promise<Deliverable> {
  if (!isWorkProductKind(input.kind)) badRequest(`${input.kind} is not a work-product kind`);
  const title = input.title.trim();
  if (!title) badRequest("title is required");

  const gate = initialWorkProductGate(input.quarantined ?? false);
  const makePrimary = input.makePrimary ?? true;

  return prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.deliverable.updateMany({
        where: { taskId: input.taskId, kind: input.kind as DeliverableKind, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.deliverable.create({
      data: {
        taskId: input.taskId,
        profileId: input.profileId,
        projectId: input.projectId ?? null,
        kind: input.kind as DeliverableKind,
        title,
        url: input.url ?? null,
        provider: input.provider ?? null,
        externalId: input.externalId ?? null,
        createdByRunId: input.createdByRunId ?? null,
        reviewState: gate.reviewState,
        outputStatus: gate.outputStatus,
        isPrimary: makePrimary,
      },
    });
  });
}

/** List a task's work products (output-type deliverables only), newest first. */
export function listWorkProductsByTask(taskId: string): Promise<Deliverable[]> {
  return prisma.deliverable.findMany({
    where: {
      taskId,
      kind: { in: ["pull_request", "branch", "commit", "preview_url", "runtime_service"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * A board reviewer sets the review-state of a work product (approve / request changes). An agent
 * cannot self-approve — the caller must be a human reviewer (enforced at the GraphQL edge via
 * requireRole admin). Only a work product currently `needs_review` may be decided. Advances the
 * output status legally alongside the decision.
 */
export async function setWorkProductReviewState(input: {
  deliverableId: string;
  reviewState: string;
  reviewedByProfileId: string;
}): Promise<Deliverable> {
  if (!isWorkProductReviewState(input.reviewState) || input.reviewState === "none")
    badRequest("reviewState must be needs_review | approved | changes_requested");

  const wp = await prisma.deliverable.findUnique({
    where: { id: input.deliverableId },
    select: { id: true, kind: true, reviewState: true, outputStatus: true },
  });
  if (!wp) throw new GraphQLError("Work product not found", { extensions: { code: "NOT_FOUND" } });
  if (!isWorkProductKind(wp.kind)) badRequest("not a work product");

  // Only a decision on a pending review is meaningful (approve/changes need a needs_review origin).
  const decision = input.reviewState as WorkProductReviewState;
  if (decision !== "needs_review" && wp.reviewState !== "needs_review")
    badRequest("only a work product awaiting review can be approved or sent back");

  const nextStatus =
    decision === "approved"
      ? "approved"
      : decision === "changes_requested"
        ? "changes_requested"
        : (wp.outputStatus ?? "ready_for_review");
  if (wp.outputStatus && !canTransitionWorkProductStatus(wp.outputStatus, nextStatus))
    badRequest(`illegal status transition ${wp.outputStatus} → ${nextStatus}`);

  return prisma.deliverable.update({
    where: { id: wp.id },
    data: { reviewState: decision, outputStatus: nextStatus },
  });
}

/** Update the lifecycle status of a work product with a transition guard. */
export async function setWorkProductStatus(
  deliverableId: string,
  status: string,
): Promise<Deliverable> {
  const wp = await prisma.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, kind: true, outputStatus: true },
  });
  if (!wp) throw new GraphQLError("Work product not found", { extensions: { code: "NOT_FOUND" } });
  if (!isWorkProductKind(wp.kind)) badRequest("not a work product");
  if (!canTransitionWorkProductStatus(wp.outputStatus, status))
    badRequest(`illegal status transition ${wp.outputStatus ?? "(none)"} → ${status}`);
  return prisma.deliverable.update({ where: { id: wp.id }, data: { outputStatus: status } });
}
