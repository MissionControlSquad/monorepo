import { withAgent } from "../../../_lib/with-agent";
import { successResponse, errorResponse } from "../../../_lib/json-response";
import { FLAG_KEYS } from "@agentcenter/utils";
import { assembleContextBundle } from "@/server/services/agent-context";

// Tier D (Slice 3): stateless per-task context. An agent runner fetches everything it needs to run
// ONE task — identity + skills + instructions + the task, its project (git ref) and linked
// docs/deliverables/subtasks — assembled fresh from data we already own. No persistent memory store.
// Agent-key auth; the task is scoped to what the agent may access.
export const GET = withAgent(
  async (request, agent) => {
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) return errorResponse("taskId is required", 400);

    const bundle = await assembleContextBundle(
      {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        username: agent.username ?? null,
        identityEmoji: agent.identityEmoji ?? null,
        templateId: agent.templateId ?? null,
        personality: agent.personality ?? null,
        level: agent.level ?? null,
        runtimeAdapter: agent.runtimeAdapter ?? null,
        runtimeModel: agent.runtimeModel ?? null,
        runtimeTemplate: agent.runtimeTemplate ?? null,
        memoryProvider: agent.memoryProvider ?? null,
        workspaceId: agent.workspaceId ?? null,
      },
      taskId,
    );
    return successResponse(bundle);
  },
  { feature: { flag: FLAG_KEYS.RUNNERS, error: "Runners are not enabled" } },
);
