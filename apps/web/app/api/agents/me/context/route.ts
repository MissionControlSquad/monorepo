import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { assembleContextBundle } from "@/server/services/agent-context";

// Tier D (Slice 3): stateless per-task context. An agent runner fetches everything it needs to run
// ONE task — identity + skills + instructions + the task, its project (git ref) and linked
// docs/deliverables/subtasks — assembled fresh from data we already own. No persistent memory store.
// Agent-key auth; the task is scoped to what the agent may access.
export async function GET(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.RUNNERS)))
      return errorResponse("Runners are not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);

    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) return errorResponse("taskId is required", 400);

    const bundle = await assembleContextBundle(
      {
        id: agent.id,
        name: agent.name,
        role: agent.role,
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
  } catch (err) {
    return handleError(err);
  }
}
