import { prisma } from "@/server/prisma";
import type { ToolAccessPolicy } from "@agentcenter/database";
import {
  evaluateToolAccess,
  type ToolAccessDecision,
  type ToolAccessEffect,
  type ToolAccessRule,
} from "@agentcenter/utils";

// Tool access-policy service (parity #21). Persists the declarative rules and resolves a decision via
// the pure evaluator. ENFORCEMENT belongs to the tool runtime (absent) — this is the storage + query
// layer, ready to plug in. Workspace-scoped; mutations are admin-gated at the edge when wired.

const EFFECTS = new Set<ToolAccessEffect>(["allow", "deny"]);

function toRule(row: ToolAccessPolicy): ToolAccessRule {
  return {
    id: row.id,
    agentId: row.agentId,
    toolPattern: row.toolPattern,
    effect: (EFFECTS.has(row.effect as ToolAccessEffect) ? row.effect : "allow") as ToolAccessEffect,
    priority: row.priority,
  };
}

/** All policies for a workspace (workspace-wide + every agent's), newest-highest-priority first. */
export function listToolAccessPolicies(
  workspaceId: string,
  agentId?: string | null,
): Promise<ToolAccessPolicy[]> {
  return prisma.toolAccessPolicy.findMany({
    where: {
      workspaceId,
      ...(agentId === undefined ? {} : { agentId }),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

/** Create or update a policy. `id` present → update (scoped to the workspace); else create. */
export async function setToolAccessPolicy(input: {
  id?: string | null;
  workspaceId: string;
  agentId?: string | null;
  toolPattern: string;
  effect: string;
  priority?: number;
  reason?: string | null;
}): Promise<ToolAccessPolicy> {
  const effect: ToolAccessEffect = EFFECTS.has(input.effect as ToolAccessEffect)
    ? (input.effect as ToolAccessEffect)
    : "allow";
  const pattern = input.toolPattern.trim();
  if (!pattern) throw new Error("toolPattern is required");

  const data = {
    agentId: input.agentId ?? null,
    toolPattern: pattern,
    effect,
    priority: input.priority ?? 0,
    reason: input.reason ?? null,
  };

  if (input.id) {
    // Scope the update to the workspace so a stale/cross-workspace id can't be edited.
    const existing = await prisma.toolAccessPolicy.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!existing) throw new Error("policy not found");
    return prisma.toolAccessPolicy.update({ where: { id: input.id }, data });
  }
  return prisma.toolAccessPolicy.create({ data: { workspaceId: input.workspaceId, ...data } });
}

/** Delete a policy (workspace-scoped). Returns true if a row was removed. */
export async function deleteToolAccessPolicy(id: string, workspaceId: string): Promise<boolean> {
  const res = await prisma.toolAccessPolicy.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/**
 * Resolve whether a tool is allowed for an agent: load the workspace-wide + agent-scoped rules and
 * run the pure evaluator. Default-allow when no rule matches.
 */
export async function resolveToolAccess(
  workspaceId: string,
  agentId: string | null,
  toolName: string,
  defaultEffect: ToolAccessEffect = "allow",
): Promise<ToolAccessDecision> {
  const rows = await prisma.toolAccessPolicy.findMany({
    where: { workspaceId, OR: [{ agentId: null }, ...(agentId ? [{ agentId }] : [])] },
  });
  return evaluateToolAccess(rows.map(toRule), toolName, { agentId, defaultEffect });
}
