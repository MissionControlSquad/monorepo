import { withAgent } from "../../_lib/with-agent";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { prisma } from "@/server/prisma";
import { FLAG_KEYS } from "@agentcenter/utils";
import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";

// Epic #3: read a single approval. Cross-workspace ids return 404 (no existence leakage).
export const GET = withAgent(
  async (_request, agent, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const { id } = await context.params;

    const approval = await prisma.approval.findFirst({
      where: { id, workspaceId },
      include: { comments: true },
    });
    if (!approval) return errorResponse("Approval not found", 404, "NOT_FOUND");
    return successResponse({ approval });
  },
  { feature: { flag: FLAG_KEYS.GOVERNANCE, error: "Governance is not enabled" } },
);
