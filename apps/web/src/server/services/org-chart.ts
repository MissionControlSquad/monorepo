/**
 * Org chart (Epic #19) — DB reads + throwing guards. The pure health/tree/cycle logic is shared in
 * @agentcenter/utils (web/desktop/mobile); this file only does I/O and maps to GraphQLError.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { wouldCreateCycle } from "@agentcenter/utils";
import type { Agent } from "@agentcenter/database";

// Re-export the shared pure logic for existing importers (attention feed, graphql resolvers).
export {
  getAgentOrgChainHealth,
  buildOrgTree,
  type OrgAgent,
  type OrgChainHealth,
  type OrgChainReason,
  type OrgTreeNode,
} from "@agentcenter/utils";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Reject a manager assignment that would create a cycle (throwing wrapper over the shared predicate). */
export function assertNoReportingCycle(
  agents: { id: string; reportsToAgentId: string | null }[],
  agentId: string,
  managerId: string | null,
): void {
  if (managerId === agentId) badRequest("An agent cannot report to itself");
  const edges = agents.map((a) => ({ id: a.id, parentId: a.reportsToAgentId }));
  if (wouldCreateCycle(edges, agentId, managerId)) {
    badRequest("An agent cannot report to its own report (cycle)");
  }
}

/** All agents in the workspace, with the fields the org chart needs. */
export function getOrgChartAgents(workspaceId: string): Promise<Agent[]> {
  return prisma.agent.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function setAgentReportsTo(
  workspaceId: string,
  agentId: string,
  managerId: string | null,
): Promise<Agent> {
  const agent = await prisma.agent.findFirst({
    where: { workspaceId, id: agentId },
    select: { id: true },
  });
  if (!agent) badRequest("agentId does not reference an agent in this workspace");
  if (managerId) {
    const manager = await prisma.agent.findFirst({
      where: { workspaceId, id: managerId },
      select: { id: true },
    });
    if (!manager) badRequest("reportsToAgentId does not reference an agent in this workspace");
    const all = await prisma.agent.findMany({
      where: { workspaceId },
      select: { id: true, reportsToAgentId: true },
    });
    assertNoReportingCycle(all, agentId, managerId);
  }
  return prisma.agent.update({ where: { id: agentId }, data: { reportsToAgentId: managerId } });
}
