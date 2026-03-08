import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { env } from "@/server/env";
import { applyAgentStatusUpdate } from "@/server/agent-status";

// 5 minutes — heartbeat timeout threshold
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const staleAgents = await prisma.agent.findMany({
    where: {
      status: { not: "idle" },
      OR: [{ lastHeartbeat: { lt: threshold } }, { lastHeartbeat: null }],
    },
    select: { id: true, name: true, status: true, detailedStatus: true },
  });

  let sleptCount = 0;
  for (const agent of staleAgents) {
    // Re-check so we don't overwrite a concurrent heartbeat (single write via central module)
    const stillStale = await prisma.agent.findFirst({
      where: {
        id: agent.id,
        status: { not: "idle" },
        OR: [{ lastHeartbeat: { lt: threshold } }, { lastHeartbeat: null }],
      },
    });
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
