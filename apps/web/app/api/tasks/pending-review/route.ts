export const dynamic = "force-dynamic";

import { taskModel } from "@/server/models/task";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { getAgentProjectIds } from "../../_lib/project-access";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);

    if (!(await isFeatureEnabled(FLAG_KEYS.REVIEWS))) {
      return errorResponse("Reviews feature is not available on your current plan", 403);
    }

    const agentProjectIds = await getAgentProjectIds(agent.id);

    const tasks = await taskModel.findMany({
      where: {
        status: "review",
        OR: [{ projectId: { in: agentProjectIds } }, { projectId: null }],
      },
      include: {
        assignees: { include: { profile: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { fromProfile: true },
        },
        deliverables: { take: 20 },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });

    return successResponse(tasks);
  } catch (err) {
    return handleError(err);
  }
}
