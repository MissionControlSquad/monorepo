/**
 * Budget policy + incident service (Epic #4). All operations are workspace-scoped: the
 * `workspaceId` is always part of the write filter so a caller can never mutate another
 * workspace's rows (D5, security boundary). Resolvers stay thin and delegate here.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type {
  BudgetPolicy,
  BudgetIncident,
  BudgetScope,
  BudgetWindow,
} from "@agentcenter/database";
import type { AgentStatusValue } from "@/server/constants";
import { EventTypes } from "@/server/constants";
import { emit } from "@/server/events";
import { applyAgentStatusUpdate } from "@/server/agent-status";
import { AUTO_PAUSE_MESSAGE } from "./budget-enforcement";
import { windowBounds } from "./budget-window";

export interface CreateBudgetPolicyInput {
  workspaceId: string;
  scope: BudgetScope;
  agentId?: string | null;
  name: string;
  limitCents: number;
  window: BudgetWindow;
  hardStop?: boolean;
  warnPercent?: number | null;
}

export interface UpdateBudgetPolicyInput {
  workspaceId: string;
  id: string;
  name?: string | null;
  limitCents?: number | null;
  window?: BudgetWindow | null;
  hardStop?: boolean | null;
  isActive?: boolean | null;
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function createBudgetPolicy(input: CreateBudgetPolicyInput): Promise<BudgetPolicy> {
  if (input.scope === "agent" && !input.agentId) {
    badRequest("agentId is required when scope is 'agent'");
  }
  if (input.scope === "workspace" && input.agentId) {
    badRequest("agentId must be omitted when scope is 'workspace'");
  }
  if (!Number.isInteger(input.limitCents) || input.limitCents <= 0) {
    badRequest("limitCents must be a positive integer");
  }
  const warnPercent = input.warnPercent ?? 80;
  if (!Number.isInteger(warnPercent) || warnPercent < 0 || warnPercent > 100) {
    badRequest("warnPercent must be an integer between 0 and 100");
  }
  return prisma.budgetPolicy.create({
    data: {
      workspaceId: input.workspaceId,
      scope: input.scope,
      agentId: input.scope === "agent" ? input.agentId : null,
      name: input.name,
      limitCents: input.limitCents,
      window: input.window,
      hardStop: input.hardStop ?? false,
      warnPercent,
    },
  });
}

export async function updateBudgetPolicy(input: UpdateBudgetPolicyInput): Promise<BudgetPolicy> {
  const existing = await prisma.budgetPolicy.findFirst({
    where: { id: input.id, workspaceId: input.workspaceId },
  });
  if (!existing)
    throw new GraphQLError("Budget policy not found", { extensions: { code: "NOT_FOUND" } });

  if (input.limitCents != null && (!Number.isInteger(input.limitCents) || input.limitCents <= 0)) {
    badRequest("limitCents must be a positive integer");
  }

  return prisma.budgetPolicy.update({
    where: { id: input.id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.limitCents != null ? { limitCents: input.limitCents } : {}),
      ...(input.window != null ? { window: input.window } : {}),
      ...(input.hardStop != null ? { hardStop: input.hardStop } : {}),
      ...(input.isActive != null ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteBudgetPolicy(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.budgetPolicy.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/**
 * Resolve an open incident. Sets status/resolvedAt/resolvedById (+ optional detail) and emits
 * BUDGET_INCIDENT_RESOLVED. Deliberately does NOT unpause the agent — reactivation is a
 * separate, explicit updateAgentStatus action (R9).
 */
export async function resolveBudgetIncident(args: {
  incidentId: string;
  workspaceId: string;
  resolvedById: string;
  detail?: string | null;
}): Promise<BudgetIncident> {
  const res = await prisma.budgetIncident.updateMany({
    where: { id: args.incidentId, workspaceId: args.workspaceId, status: "open" },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedById: args.resolvedById,
      ...(args.detail != null ? { detail: args.detail } : {}),
    },
  });
  const incident = await prisma.budgetIncident.findFirst({
    where: { id: args.incidentId, workspaceId: args.workspaceId },
  });
  if (!incident)
    throw new GraphQLError("Incident not found", { extensions: { code: "NOT_FOUND" } });

  if (res.count > 0) {
    // Dismissing the incident cancels its budget_override approval so it does not orphan in the
    // approvals inbox. (Resume is the other path — it approves the approval instead.)
    if (incident.approvalId) {
      await prisma.approval.updateMany({
        where: { id: incident.approvalId, workspaceId: args.workspaceId, status: "pending" },
        data: { status: "cancelled", decidedById: args.resolvedById, decidedAt: new Date() },
      });
    }
    await emit({
      type: EventTypes.BUDGET_INCIDENT_RESOLVED,
      incidentId: incident.id,
      workspaceId: args.workspaceId,
      policyId: incident.policyId,
      resolvedById: args.resolvedById,
    });
  }
  return incident;
}

/** Budget-paused agents to reactivate on resume: the one agent, or all workspace agents blocked
 *  specifically by the budget auto-pause (identified by the auto-pause status message). */
async function budgetPausedAgentIds(policy: {
  scope: string;
  agentId: string | null;
  workspaceId: string;
}): Promise<string[]> {
  if (policy.scope === "agent") {
    if (!policy.agentId) return [];
    const a = await prisma.agent.findFirst({
      where: { id: policy.agentId, status: "blocked", statusMessage: AUTO_PAUSE_MESSAGE },
      select: { id: true },
    });
    return a ? [a.id] : [];
  }
  const agents = await prisma.agent.findMany({
    where: {
      workspaceId: policy.workspaceId,
      status: "blocked",
      statusMessage: AUTO_PAUSE_MESSAGE,
    },
    select: { id: true },
  });
  return agents.map((x) => x.id);
}

/**
 * Paperclip parity `raise_budget_and_resume`: raise a hard-stopped policy's limit ABOVE the
 * current observed spend, resolve the incident (+ its budget_override approval), reset the window
 * flags, and reactivate the budget-paused agent(s). The new limit MUST exceed observed spend —
 * otherwise the agent would immediately re-breach. This is the ONLY path that reactivates an
 * agent paused by a budget (a plain resolve does not, R9).
 */
export async function raiseBudgetAndResume(args: {
  incidentId: string;
  workspaceId: string;
  newLimitCents: number;
  resolvedById: string;
}): Promise<BudgetIncident> {
  const incident = await prisma.budgetIncident.findFirst({
    where: { id: args.incidentId, workspaceId: args.workspaceId },
  });
  if (!incident)
    throw new GraphQLError("Incident not found", { extensions: { code: "NOT_FOUND" } });
  if (incident.status !== "open" || incident.thresholdType !== "hard")
    badRequest("Only an open hard-breach incident can be resumed");

  const policy = await prisma.budgetPolicy.findFirst({
    where: { id: incident.policyId, workspaceId: args.workspaceId },
  });
  if (!policy) throw new GraphQLError("Policy not found", { extensions: { code: "NOT_FOUND" } });

  // Observed spend = the live current-window spend for the policy.
  const { windowStart } = windowBounds(policy.window, new Date());
  const qw = await prisma.quotaWindow.findUnique({
    where: { policyId_windowStart: { policyId: policy.id, windowStart } },
  });
  const observed = qw?.spendCents ?? incident.spendCents;
  if (!Number.isInteger(args.newLimitCents) || args.newLimitCents <= observed)
    badRequest(`New limit must be an integer greater than current spend (${observed} cents)`);

  await prisma.$transaction(async (tx) => {
    await tx.budgetPolicy.update({
      where: { id: policy.id },
      data: { limitCents: args.newLimitCents },
    });
    if (qw) {
      await tx.quotaWindow.update({
        where: { id: qw.id },
        data: { breached: false, warned: false },
      });
    }
    await tx.budgetIncident.update({
      where: { id: incident.id },
      data: { status: "resolved", resolvedAt: new Date(), resolvedById: args.resolvedById },
    });
    if (incident.approvalId) {
      await tx.approval.updateMany({
        where: { id: incident.approvalId, workspaceId: args.workspaceId },
        data: { status: "approved", decidedById: args.resolvedById, decidedAt: new Date() },
      });
    }
  });

  // Reactivate the budget-paused agent(s) — explicit resume, outside the txn (emits events).
  for (const id of await budgetPausedAgentIds(policy)) {
    await applyAgentStatusUpdate(id, {
      status: "idle" as AgentStatusValue,
      statusMessage: null,
    });
  }

  await emit({
    type: EventTypes.BUDGET_INCIDENT_RESOLVED,
    incidentId: incident.id,
    workspaceId: args.workspaceId,
    policyId: incident.policyId,
    resolvedById: args.resolvedById,
  });

  return prisma.budgetIncident.findFirstOrThrow({
    where: { id: incident.id, workspaceId: args.workspaceId },
  });
}
