/**
 * Org chart — agent reporting hierarchy (Epic #19). A self-referencing `reportsToAgentId` edge on
 * Agent, plus the org-chain integrity algorithm ported from Paperclip
 * `packages/shared/src/agent-eligibility.ts` (`getAgentOrgChainHealth`) — the two structural failure
 * modes that map to this codebase: a reporting **cycle** and a **missing manager** (spec D2).
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Agent } from "@agentcenter/database";

export interface OrgAgent {
  id: string;
  name: string;
  reportsToAgentId: string | null;
}

export type OrgChainReason = "healthy" | "cycle" | "missing_manager";
export interface OrgChainHealth {
  status: "healthy" | "invalid_org_chain";
  reason: OrgChainReason;
  /** Manager chain from the agent upward (ids), including the agent itself first. */
  chain: string[];
  invalidAncestorId: string | null;
}

/**
 * Pure: walk an agent's reporting chain upward. Detects a cycle (an ancestor already seen) and a
 * missing manager (`reportsToAgentId` points at an agent not in the set). Ported from
 * `getAgentOrgChainHealth`.
 */
export function getAgentOrgChainHealth(agentId: string, agents: OrgAgent[]): OrgChainHealth {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const self = byId.get(agentId);
  const chain: string[] = [agentId];
  if (!self) {
    return {
      status: "invalid_org_chain",
      reason: "missing_manager",
      chain,
      invalidAncestorId: agentId,
    };
  }

  const seen = new Set<string>([agentId]);
  let current: OrgAgent = self;
  while (current.reportsToAgentId) {
    const managerId = current.reportsToAgentId;
    if (seen.has(managerId)) {
      chain.push(managerId);
      return { status: "invalid_org_chain", reason: "cycle", chain, invalidAncestorId: managerId };
    }
    const manager = byId.get(managerId);
    if (!manager) {
      chain.push(managerId);
      return {
        status: "invalid_org_chain",
        reason: "missing_manager",
        chain,
        invalidAncestorId: managerId,
      };
    }
    seen.add(managerId);
    chain.push(managerId);
    current = manager;
  }
  return { status: "healthy", reason: "healthy", chain, invalidAncestorId: null };
}

/** Pure: reject a manager assignment that would create a cycle (self or a descendant as manager). */
export function assertNoReportingCycle(
  agents: OrgAgent[],
  agentId: string,
  managerId: string | null,
): void {
  if (!managerId) return;
  if (managerId === agentId) badRequest("An agent cannot report to itself");
  const byId = new Map(agents.map((a) => [a.id, a]));
  let cursor: string | null | undefined = managerId;
  let guard = agents.length + 1;
  while (cursor && guard-- > 0) {
    if (cursor === agentId) badRequest("An agent cannot report to its own report (cycle)");
    cursor = byId.get(cursor)?.reportsToAgentId ?? null;
  }
}

export interface OrgTreeNode extends OrgAgent {
  role: string;
  status: string;
  reports: OrgTreeNode[];
}

/** Pure: assemble the nested org tree from a flat agent list. Orphans (dangling manager) re-root. */
export function buildOrgTree(
  agents: {
    id: string;
    name: string;
    role: string;
    status: string;
    reportsToAgentId: string | null;
  }[],
): OrgTreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, { ...a, reports: [] as OrgTreeNode[] }]));
  const roots: OrgTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.reportsToAgentId ? byId.get(node.reportsToAgentId) : null;
    if (parent && parent.id !== node.id) parent.reports.push(node);
    else roots.push(node);
  }
  return roots;
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
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
      select: { id: true, name: true, reportsToAgentId: true },
    });
    assertNoReportingCycle(all, agentId, managerId);
  }
  return prisma.agent.update({ where: { id: agentId }, data: { reportsToAgentId: managerId } });
}
