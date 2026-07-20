/**
 * Approvals service (Epic #3) — agent-domain governance, workspace-scoped.
 * Human decisions transition the linked task's status directly (same TaskStatus values as the
 * agent review flow); the agent-comment-heavy review path (performApproveTask) is left for the
 * existing agent auto-review mutations and is intentionally not reused here (it is agent-coupled).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/prisma";
import {
  ApprovalStatus as ApprovalStatusConst,
  ApprovalSubjectType as ApprovalSubjectTypeConst,
} from "@agentcenter/utils";
import type { ApprovalSubjectType, Prisma, AgentLevel } from "@agentcenter/database";
import { TaskStatus } from "../constants";

export interface CreateApprovalInput {
  workspaceId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  taskId?: string | null;
  title: string;
  reason?: string | null;
  requestedById: string; // Profile id
  payload?: Prisma.InputJsonValue;
  requiredApprovals?: number; // Domain 14 #14 — N-of-M board quorum (default 1)
}

export function createApproval(input: CreateApprovalInput) {
  const { requiredApprovals, ...rest } = input;
  return prisma.approval.create({
    data: { ...rest, requiredApprovals: Math.max(1, requiredApprovals ?? 1) },
  });
}

/**
 * Cast one board member's vote on an approval (Domain 14 #14). A single `reject` finalizes the approval
 * as rejected immediately. Once distinct `approve` votes reach requiredApprovals, the approval is
 * finalized via decideApproval (running the same side effects — hire fulfilment, task transition). A
 * voter may vote once; re-voting updates their vote. Returns the current tally + final status.
 */
export async function castApprovalVote(input: {
  approvalId: string;
  workspaceId: string;
  voterProfileId: string;
  vote: "approve" | "reject";
}): Promise<{ status: string; approveVotes: number; requiredApprovals: number }> {
  const approval = await findScoped(input.approvalId, input.workspaceId);
  if (approval.status !== "pending" && approval.status !== "needs_changes") {
    throw Object.assign(new Error(`Approval is not votable (status: ${approval.status})`), {
      status: 400,
    });
  }

  await prisma.approvalVote.upsert({
    where: {
      approvalId_voterProfileId: {
        approvalId: input.approvalId,
        voterProfileId: input.voterProfileId,
      },
    },
    create: {
      approvalId: input.approvalId,
      voterProfileId: input.voterProfileId,
      vote: input.vote,
    },
    update: { vote: input.vote },
  });

  if (input.vote === "reject") {
    await decideApproval({
      approvalId: input.approvalId,
      workspaceId: input.workspaceId,
      decision: "reject",
      decidedById: input.voterProfileId,
    });
    return { status: "rejected", approveVotes: 0, requiredApprovals: approval.requiredApprovals };
  }

  const approveVotes = await prisma.approvalVote.count({
    where: { approvalId: input.approvalId, vote: "approve" },
  });
  if (approveVotes >= approval.requiredApprovals) {
    await decideApproval({
      approvalId: input.approvalId,
      workspaceId: input.workspaceId,
      decision: "approve",
      decidedById: input.voterProfileId,
    });
    return {
      status: "approved",
      approveVotes,
      requiredApprovals: approval.requiredApprovals,
    };
  }
  return { status: "pending", approveVotes, requiredApprovals: approval.requiredApprovals };
}

/** The spec carried by a hire_agent approval's payload (Domain 14 #3). */
export interface AgentHireSpec {
  name: string;
  role: string;
  reportsToAgentId?: string | null;
  level?: string | null;
  personality?: string | null;
}

const VALID_AGENT_LEVELS = new Set(["intern", "specialist", "lead"]);

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent"
  );
}

/**
 * Propose hiring an agent (Domain 14 #3). Creates a pending hire_agent approval carrying the agent
 * spec in `payload`; the agent is NOT created until the approval is approved (decideApproval fulfils
 * it). Workspace-scoped; the manager the new agent reports to must be in the same workspace.
 */
export async function requestAgentHire(input: {
  workspaceId: string;
  spec: AgentHireSpec;
  requestedById: string;
  reason?: string | null;
}) {
  const name = input.spec.name?.trim();
  if (!name) throw Object.assign(new Error("hire spec requires a name"), { status: 400 });
  if (!input.spec.role?.trim())
    throw Object.assign(new Error("hire spec requires a role"), { status: 400 });
  if (input.spec.reportsToAgentId) {
    const mgr = await prisma.agent.findFirst({
      where: { id: input.spec.reportsToAgentId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!mgr)
      throw Object.assign(new Error("reportsToAgentId not found in workspace"), { status: 400 });
  }
  return createApproval({
    workspaceId: input.workspaceId,
    subjectType: ApprovalSubjectTypeConst.HIRE_AGENT as ApprovalSubjectType,
    subjectId: slugify(name),
    title: `Hire agent: ${name}`,
    reason: input.reason ?? null,
    requestedById: input.requestedById,
    payload: {
      name,
      role: input.spec.role,
      reportsToAgentId: input.spec.reportsToAgentId ?? null,
      level: input.spec.level ?? null,
      personality: input.spec.personality ?? null,
    },
  });
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

    // Domain 14 #3: fulfil a hire_agent approval — approving it actually CREATES the agent from the
    // spec carried in payload (previously the subject type was defined but never did anything). The
    // new agent id is recorded back onto the approval payload for traceability.
    let payloadUpdate: Prisma.InputJsonValue | undefined;
    if (
      input.decision === "approve" &&
      approval.subjectType === ApprovalSubjectTypeConst.HIRE_AGENT
    ) {
      const spec = (approval.payload ?? null) as AgentHireSpec | null;
      if (spec?.name && spec.role) {
        const hired = await tx.agent.create({
          data: {
            name: spec.name,
            role: spec.role,
            workspaceId: input.workspaceId,
            username: `${slugify(spec.name)}-${randomUUID().slice(0, 6)}`,
            setupStatus: "active",
            ...(spec.level && VALID_AGENT_LEVELS.has(spec.level)
              ? { level: spec.level as AgentLevel }
              : {}),
            ...(spec.personality ? { personality: spec.personality } : {}),
            ...(spec.reportsToAgentId ? { reportsToAgentId: spec.reportsToAgentId } : {}),
          },
        });
        payloadUpdate = { ...spec, hiredAgentId: hired.id } as Prisma.InputJsonValue;
      }
    }

    return tx.approval.update({
      where: { id: input.approvalId },
      data: {
        status: newStatus,
        decidedById: input.decidedById,
        decidedAt: new Date(),
        decisionNote: input.decisionNote ?? null,
        ...(payloadUpdate !== undefined ? { payload: payloadUpdate } : {}),
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
