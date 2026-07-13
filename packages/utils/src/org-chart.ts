/**
 * Org chart — agent reporting hierarchy (Epic #19). Shared pure logic (health + tree). Import from
 * @agentcenter/utils. The web service does the DB reads + throwing guards.
 */
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
 * missing manager (`reportsToAgentId` points at an agent not in the set). Ported from Paperclip
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

export interface OrgTreeNode {
  id: string;
  name: string;
  role: string;
  status: string;
  reportsToAgentId: string | null;
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
