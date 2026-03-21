/**
 * @agentcenter/database - Agent Operations
 *
 * Find an agent by its ID.
 */

import { prisma } from "../client";
import type { Agent } from "@prisma/client";

export async function findAgentById(id: string): Promise<Agent | null> {
  return prisma.agent.findUnique({ where: { id } });
}
