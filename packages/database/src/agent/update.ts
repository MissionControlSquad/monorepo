/**
 * @agentcenter/database - Agent Operations
 *
 * Update agent fields.
 */

import { prisma } from "../client";

export async function updateAgent(id: string, data: Record<string, unknown>) {
  return prisma.agent.update({ where: { id }, data });
}

/**
 * Atomically read previous status and update agent.
 * Returns the previous status fields, or undefined if agent not found.
 */
export async function updateAgentStatusAtomically(
  id: string,
  data: Record<string, unknown>,
): Promise<{ status: string; detailedStatus: string | null; name: string } | undefined> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.agent.findUnique({
      where: { id },
      select: { status: true, detailedStatus: true, name: true },
    });
    await tx.agent.update({ where: { id }, data });
    return row ? { ...row, status: row.status as string } : undefined;
  });
}

export async function getAgentApiKeyHash(id: string) {
  return prisma.agent.findUnique({
    where: { id },
    select: { apiKeyHash: true },
  });
}

export async function findAgentsByCurrentTaskId(taskId: string) {
  return prisma.agent.findMany({
    where: { currentTaskId: taskId },
    select: { id: true },
  });
}
