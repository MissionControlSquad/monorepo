import { successResponse, errorResponse } from "../../_lib/json-response";
import { findStaleAgents, isAgentStill } from "@agentcenter/database";
import { env } from "@/server/env";
import { applyAgentStatusUpdate } from "@/server/agent-status";
import { AgentStatus } from "@/server/constants";

// 5 minutes — heartbeat timeout threshold
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return errorResponse("Unauthorized", 401);
  }

  const staleAgents = await findStaleAgents(HEARTBEAT_TIMEOUT_MS);

  let sleptCount = 0;
  for (const agent of staleAgents) {
    // Re-check so we don't overwrite a concurrent heartbeat (single write via central module)
    const stillStale = await isAgentStill(agent.id, HEARTBEAT_TIMEOUT_MS);
    if (stillStale) {
      await applyAgentStatusUpdate(agent.id, {
        status: AgentStatus.IDLE,
        detailedStatus: null,
        statusMessage: null,
        currentTaskId: null,
        currentTask: null,
      });
      sleptCount++;
    }
  }

  return successResponse({
    ok: true,
    checked: staleAgents.length,
    slept: sleptCount,
  });
}
