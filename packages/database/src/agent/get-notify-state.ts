/** @agentcenter/database - Agent state lookup for live-gateway notification routing. */

import { prisma } from "../client";

export type AgentNotifyState = {
  id: string;
  username: string | null;
  name: string;
  currentTaskId: string | null;
  lastHeartbeat: Date | null;
};

/**
 * Fetch the minimal agent state needed to route a live notification:
 * slug (username/name), and busy-check fields (currentTaskId, lastHeartbeat).
 */
export async function getAgentsNotifyState(agentIds: string[]): Promise<AgentNotifyState[]> {
  if (!agentIds.length) return [];
  return prisma.agent
    .findMany({
      where: { id: { in: agentIds } },
      select: { id: true, username: true, name: true, currentTaskId: true, lastHeartbeat: true },
    })
    .catch(() => []);
}
