import { withAgent } from "../_lib/with-agent";
import { successResponse, errorResponse } from "../_lib/json-response";
import { prisma } from "@/server/prisma";
import { FLAG_KEYS } from "@agentcenter/utils";
import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { createApproval } from "@/server/services/approvals";
import type { ApprovalStatus, ApprovalSubjectType } from "@agentcenter/database";

const SUBJECT_TYPES: ApprovalSubjectType[] = ["task", "deliverable", "hire_agent"];

// Epic #3: agent-facing approvals (create/list). Scoped to the resolving agent's workspace.
export const GET = withAgent(
  async (request, agent) => {
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const status = new URL(request.url).searchParams.get("status") as ApprovalStatus | null;
    const approvals = await prisma.approval.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return successResponse({ approvals });
  },
  { feature: { flag: FLAG_KEYS.GOVERNANCE, error: "Governance is not enabled" } },
);

export const POST = withAgent(
  async (request, agent) => {
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;

    const body = (await request.json()) as {
      subjectType?: string;
      subjectId?: string;
      taskId?: string;
      title?: string;
      reason?: string;
    };
    if (!body.subjectType || !SUBJECT_TYPES.includes(body.subjectType as ApprovalSubjectType))
      return errorResponse("subjectType must be one of task|deliverable|hire_agent", 400);
    if (!body.subjectId) return errorResponse("subjectId is required", 400);
    if (!body.title) return errorResponse("title is required", 400);

    const requestedById = await getOrCreateAgentProfileId(agent.id);
    const approval = await createApproval({
      workspaceId,
      subjectType: body.subjectType as ApprovalSubjectType,
      subjectId: body.subjectId,
      taskId: body.taskId ?? null,
      title: body.title,
      reason: body.reason ?? null,
      requestedById,
    });
    return successResponse({ approval }, 201);
  },
  { feature: { flag: FLAG_KEYS.GOVERNANCE, error: "Governance is not enabled" } },
);
