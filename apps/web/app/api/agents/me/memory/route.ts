import { withAgent } from "../../../_lib/with-agent";
import { successResponse, errorResponse } from "../../../_lib/json-response";
import { FLAG_KEYS } from "@agentcenter/utils";
import { appendAgentMemory } from "@/server/services/agent-memory";

// Tier D memory (db provider): a runner posts a memory entry produced by a task run. Agent-key auth;
// stored control-plane-side with provenance (sourceTaskId). Only meaningful when the agent's
// memoryProvider is `db` — for none/markdown the runner never calls this.
export const POST = withAgent(
  async (request, agent) => {
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
  },
  { feature: FLAG_KEYS.MEMORY },
);
