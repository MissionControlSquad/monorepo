import { NextResponse } from "next/server";
import { findStaleAgents, isAgentStill } from "@agentcenter/database";
import { env } from "@/server/env";
import { applyAgentStatusUpdate } from "@/server/agent-status";

// 5 minutes — heartbeat timeout threshold
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleAgents = await findStaleAgents(HEARTBEAT_TIMEOUT_MS);

  let sleptCount = 0;
  for (const agent of staleAgents) {
    // Re-check so we don't overwrite a concurrent heartbeat (single write via central module)
    const stillStale = await isAgentStill(agent.id, HEARTBEAT_TIMEOUT_MS);
    if (stillStale) {
      await applyAgentStatusUpdate(agent.id, {
        status: "idle",
        detailedStatus: null,
        statusMessage: null,
        currentTaskId: null,
        currentTask: null,
      });
      sleptCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: staleAgents.length,
    slept: sleptCount,
  });
}
