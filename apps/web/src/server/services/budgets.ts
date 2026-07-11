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
import { EventTypes } from "@/server/constants";
import { emit } from "@/server/events";

export interface CreateBudgetPolicyInput {
  workspaceId: string;
  scope: BudgetScope;
  agentId?: string | null;
  name: string;
  limitCents: number;
  window: BudgetWindow;
  hardStop?: boolean;
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
  return prisma.budgetPolicy.create({
    data: {
      workspaceId: input.workspaceId,
      scope: input.scope,
      agentId: input.scope === "agent" ? input.agentId : null,
      name: input.name,
      limitCents: input.limitCents,
      window: input.window,
      hardStop: input.hardStop ?? false,
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
