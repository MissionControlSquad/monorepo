import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { prisma } from "@/server/prisma";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";

// Epic #3: read a single approval. Cross-workspace ids return 404 (no existence leakage).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.GOVERNANCE)))
      return errorResponse("Governance is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const { id } = await context.params;

    const approval = await prisma.approval.findFirst({
      where: { id, workspaceId },
      include: { comments: true },
    });
    if (!approval) return errorResponse("Approval not found", 404, "NOT_FOUND");
    return successResponse({ approval });
  } catch (err) {
    return handleError(err);
  }
}
