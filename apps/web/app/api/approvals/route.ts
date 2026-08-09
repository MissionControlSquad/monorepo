import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { prisma } from "@/server/prisma";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { createApproval } from "@/server/services/approvals";
import type { ApprovalStatus, ApprovalSubjectType } from "@agentcenter/database";

const SUBJECT_TYPES: ApprovalSubjectType[] = ["task", "deliverable", "hire_agent"];

// Epic #3: agent-facing approvals (create/list). Scoped to the resolving agent's workspace.
export async function GET(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.GOVERNANCE)))
      return errorResponse("Governance is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const status = new URL(request.url).searchParams.get("status") as ApprovalStatus | null;
    const approvals = await prisma.approval.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return successResponse({ approvals });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.GOVERNANCE)))
      return errorResponse("Governance is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
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
  } catch (err) {
    return handleError(err);
  }
}
