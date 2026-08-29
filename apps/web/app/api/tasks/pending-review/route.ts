export const dynamic = "force-dynamic";

import { taskModel } from "@/server/models/task";
import { withAgent } from "../../_lib/with-agent";
import { successResponse } from "../../_lib/json-response";
import { ERR } from "../../_lib/error-messages";
import { getAgentProjectIds } from "../../_lib/project-access";
import { FLAG_KEYS, TaskStatus } from "@agentcenter/utils";

export const GET = withAgent(
  async (_request, agent) => {
    const agentProjectIds = await getAgentProjectIds(agent.id);

    const tasks = await taskModel.findMany({
      where: {
        status: TaskStatus.REVIEW,
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
  },
  { feature: { flag: FLAG_KEYS.REVIEWS, error: ERR.FEATURE_REVIEWS_UNAVAILABLE } },
);
