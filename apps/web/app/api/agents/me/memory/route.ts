import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { appendAgentMemory } from "@/server/services/agent-memory";

// Tier D memory (db provider): a runner posts a memory entry produced by a task run. Agent-key auth;
// stored control-plane-side with provenance (sourceTaskId). Only meaningful when the agent's
// memoryProvider is `db` — for none/markdown the runner never calls this.
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.MEMORY)))
      return errorResponse("Memory is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    if (!agent.workspaceId) return errorResponse("Agent has no workspace", 400);

    const body = (await request.json()) as { content?: string; taskId?: string | null };
    if (!body.content || !body.content.trim()) return errorResponse("content is required", 400);

    const entry = await appendAgentMemory({
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      content: body.content,
      sourceTaskId: body.taskId ?? null,
    });
    return successResponse({ ok: true, id: entry.id });
  } catch (err) {
    return handleError(err);
  }
}
