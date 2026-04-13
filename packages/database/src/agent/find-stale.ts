/**
 * @agentcenter/database - Agent Operations
 *
 * Find agents that have missed heartbeats (used by auto-sleep cron).
 */

import { prisma } from "../client";
import { AgentStatus } from "@agentcenter/utils";

export async function findStaleAgents(thresholdMs: number) {
  const threshold = new Date(Date.now() - thresholdMs);
  return prisma.agent.findMany({
    where: {
      status: { not: AgentStatus.IDLE },
      OR: [{ lastHeartbeat: { lt: threshold } }, { lastHeartbeat: null }],
    },
    select: { id: true, name: true, status: true, detailedStatus: true },
  });
}

/** Re-check a single agent to confirm it's still stale before sleeping it. */
export async function isAgentStill(agentId: string, thresholdMs: number): Promise<boolean> {
  const threshold = new Date(Date.now() - thresholdMs);
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      status: { not: AgentStatus.IDLE },
      OR: [{ lastHeartbeat: { lt: threshold } }, { lastHeartbeat: null }],
    },
  });
  return agent !== null;
}
