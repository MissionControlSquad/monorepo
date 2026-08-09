import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { InboxPolicy } from "@agentcenter/database";

// Inbox-agent policy service (parity #74). Rules decide, per inbox item kind, whether an agent may
// auto-handle it, must route it to a human, or should ignore it. resolveInboxAction() is the decision
// point the inbox/queue processor consults at dispatch time. Workspace-scoped; agent-specific rules
// win over workspace-wide, ties broken by higher priority.

const ITEM_KINDS = new Set(["mention", "task_review", "clarification", "handoff", "approval"]);
const ACTIONS = new Set(["auto_handle", "route_to_human", "ignore"]);

/** Default when no rule matches: humans stay in the loop. */
export const DEFAULT_INBOX_ACTION = "route_to_human";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Create or update an inbox policy rule. */
export async function setInboxPolicy(input: {
  id?: string;
  workspaceId: string;
  agentId?: string | null;
  itemKind: string;
  action: string;
  priority?: number;
  enabled?: boolean;
}): Promise<InboxPolicy> {
  if (!ITEM_KINDS.has(input.itemKind)) badRequest(`Unknown inbox itemKind '${input.itemKind}'`);
  if (!ACTIONS.has(input.action))
    badRequest("action must be one of: auto_handle, route_to_human, ignore");

  const data = {
    agentId: input.agentId ?? null,
    itemKind: input.itemKind,
    action: input.action,
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
  };

  if (input.id) {
    const existing = await prisma.inboxPolicy.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!existing) badRequest("Inbox policy not found");
    return prisma.inboxPolicy.update({ where: { id: input.id }, data });
  }
  return prisma.inboxPolicy.create({ data: { workspaceId: input.workspaceId, ...data } });
}

/** List a workspace's inbox policy rules, highest-priority first. */
export function listInboxPolicies(workspaceId: string, itemKind?: string): Promise<InboxPolicy[]> {
  return prisma.inboxPolicy.findMany({
    where: { workspaceId, ...(itemKind ? { itemKind } : {}) },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function deleteInboxPolicy(id: string, workspaceId: string): Promise<boolean> {
  const { count } = await prisma.inboxPolicy.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

/**
 * Decide what an agent should do with an inbox item of the given kind. Agent-specific rules take
 * precedence over workspace-wide (agentId=null) ones; among the same specificity, higher priority
 * wins. Falls back to DEFAULT_INBOX_ACTION when nothing matches.
 */
export async function resolveInboxAction(
  workspaceId: string,
  agentId: string,
  itemKind: string,
): Promise<{ action: string; matchedRuleId: string | null }> {
  const rules = await prisma.inboxPolicy.findMany({
    where: {
      workspaceId,
      itemKind,
      enabled: true,
      OR: [{ agentId }, { agentId: null }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  // Prefer an agent-specific rule; otherwise the best workspace-wide one.
  const match = rules.find((r) => r.agentId === agentId) ?? rules.find((r) => r.agentId === null);
  return match
    ? { action: match.action, matchedRuleId: match.id }
    : { action: DEFAULT_INBOX_ACTION, matchedRuleId: null };
}
