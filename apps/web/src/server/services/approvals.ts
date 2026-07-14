/**
 * Approvals service (Epic #3) — agent-domain governance, workspace-scoped.
 * Human decisions transition the linked task's status directly (same TaskStatus values as the
 * agent review flow); the agent-comment-heavy review path (performApproveTask) is left for the
 * existing agent auto-review mutations and is intentionally not reused here (it is agent-coupled).
 */
import { prisma } from "@/server/prisma";
import {
  ApprovalStatus as ApprovalStatusConst,
  ApprovalSubjectType as ApprovalSubjectTypeConst,
} from "@agentcenter/utils";
import type { ApprovalSubjectType } from "@agentcenter/database";
import { TaskStatus } from "../constants";

export interface CreateApprovalInput {
  workspaceId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  taskId?: string | null;
  title: string;
  reason?: string | null;
  requestedById: string; // Profile id
}

export function createApproval(input: CreateApprovalInput) {
  return prisma.approval.create({ data: { ...input } });
}

/** Load an approval scoped to its workspace; throws 404 for missing / cross-workspace ids. */
async function findScoped(approvalId: string, workspaceId: string) {
  const approval = await prisma.approval.findFirst({ where: { id: approvalId, workspaceId } });
  if (!approval) throw Object.assign(new Error("Approval not found"), { status: 404 });
  return approval;
}

export async function addComment(input: {
  approvalId: string;
  workspaceId: string;
  authorProfileId: string;
  body: string;
}) {
  await findScoped(input.approvalId, input.workspaceId); // isolation guard
  return prisma.approvalComment.create({
    data: {
      approvalId: input.approvalId,
      workspaceId: input.workspaceId,
      authorProfileId: input.authorProfileId,
      body: input.body,
    },
  });
}

export async function decideApproval(input: {
  approvalId: string;
  workspaceId: string;
  decision: "approve" | "reject";
  decidedById: string; // Profile id
  decisionNote?: string | null;
}) {
  const approval = await findScoped(input.approvalId, input.workspaceId);
  if (approval.status !== "pending" && approval.status !== "needs_changes") {
    throw Object.assign(new Error(`Approval is not decidable (status: ${approval.status})`), {
      status: 400,
    });
  }
  const linkedTaskId =
    approval.taskId ??
    (approval.subjectType === ApprovalSubjectTypeConst.TASK ? approval.subjectId : null);
  const newStatus = input.decision === "approve" ? "approved" : "rejected";

  return prisma.$transaction(async (tx) => {
    if (linkedTaskId) {
      const task = await tx.task.findUnique({ where: { id: linkedTaskId } });
      if (task) {
        await tx.task.update({
          where: { id: linkedTaskId },
          data: { status: input.decision === "approve" ? TaskStatus.DONE : TaskStatus.ASSIGNED },
        });
      }
    }
    return tx.approval.update({
      where: { id: input.approvalId },
      data: {
        status: newStatus,
        decidedById: input.decidedById,
        decidedAt: new Date(),
        decisionNote: input.decisionNote ?? null,
      },
    });
  });
}

/**
 * Reviewer asks for changes instead of a hard approve/reject — the missing transition into
 * `needs_changes`. Non-terminal: the requester can resubmit (resubmitApproval) or the reviewer can
 * later decide it. Only a pending approval can be sent back. Any linked task is returned to `assigned`
 * so the agent can act on the feedback.
 */
export async function requestChanges(input: {
  approvalId: string;
  workspaceId: string;
  decidedById: string; // Profile id
  decisionNote?: string | null;
}) {
  const approval = await findScoped(input.approvalId, input.workspaceId);
  if (approval.status !== ApprovalStatusConst.PENDING) {
    throw Object.assign(
      new Error(`Only a pending approval can be sent back (status: ${approval.status})`),
      { status: 400 },
    );
  }
  const linkedTaskId =
    approval.taskId ??
    (approval.subjectType === ApprovalSubjectTypeConst.TASK ? approval.subjectId : null);

  return prisma.$transaction(async (tx) => {
    if (linkedTaskId) {
      const task = await tx.task.findUnique({ where: { id: linkedTaskId } });
      if (task) {
        await tx.task.update({
          where: { id: linkedTaskId },
          data: { status: TaskStatus.ASSIGNED },
        });
      }
    }
    return tx.approval.update({
      where: { id: input.approvalId },
      data: {
        status: ApprovalStatusConst.NEEDS_CHANGES,
        decidedById: input.decidedById,
        decidedAt: new Date(),
        decisionNote: input.decisionNote ?? null,
      },
    });
  });
}

export async function resubmitApproval(approvalId: string, workspaceId: string) {
  const approval = await findScoped(approvalId, workspaceId);
  if (
    approval.status === ApprovalStatusConst.APPROVED ||
    approval.status === ApprovalStatusConst.CANCELLED
  ) {
    throw Object.assign(new Error("Cannot resubmit a finalized approval"), { status: 400 });
  }
  return prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: "pending",
      resubmitCount: { increment: 1 },
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
    },
  });
}

export async function cancelApproval(approvalId: string, workspaceId: string) {
  const approval = await findScoped(approvalId, workspaceId);
  if (approval.status === ApprovalStatusConst.APPROVED) {
    throw Object.assign(new Error("Cannot cancel an approved approval"), { status: 400 });
  }
  return prisma.approval.update({ where: { id: approvalId }, data: { status: "cancelled" } });
}
