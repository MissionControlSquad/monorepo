/**
 * Approval-policy engine service (governance depth). Persists the declarative rules and consults the
 * PURE evaluator in @agentcenter/utils (`evaluateApprovalPolicy`) to decide an action's effect:
 *   - deny            → refuse with a readable reason,
 *   - require_approval → create a pending Approval,
 *   - allow            → proceed,
 *   - NO MATCH        → fall back to the EXISTING coarse behavior (requireAgentApproval + trust flags).
 * Workspace-scoped (D5). This is where the rule engine is wired into the approval path.
 */
import { prisma } from "@/server/prisma";
import {
  ApprovalSubjectType as ApprovalSubjectTypeConst,
  APPROVAL_EFFECTS,
  evaluateApprovalPolicy,
} from "@agentcenter/utils";
import type {
  ApprovalEffect,
  ApprovalPolicyCondition,
  ApprovalPolicyContext,
  ApprovalPolicyDecision,
  ApprovalPolicyRule,
  ApprovalPolicySubject,
} from "@agentcenter/utils";
import { Prisma } from "@agentcenter/database";
import type { ApprovalPolicy, ApprovalSubjectType } from "@agentcenter/database";
import { badRequest } from "./service-errors";
import { createApproval } from "./approvals";
import { getAgentGovernance } from "./agent-governance";

const EFFECTS = new Set<ApprovalEffect>(APPROVAL_EFFECTS);

/** Map a stored row to the pure evaluator's rule shape (JSON columns cast to the typed predicates). */
function toRule(row: ApprovalPolicy): ApprovalPolicyRule {
  return {
    id: row.id,
    priority: row.priority,
    action: row.action,
    effect: (EFFECTS.has(row.effect as ApprovalEffect)
      ? row.effect
      : "require_approval") as ApprovalEffect,
    subject: (row.subject ?? null) as ApprovalPolicySubject | null,
    condition: (row.condition ?? null) as ApprovalPolicyCondition | null,
    enabled: row.enabled,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────

export function listApprovalPolicies(workspaceId: string): Promise<ApprovalPolicy[]> {
  return prisma.approvalPolicy.findMany({
    where: { workspaceId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export interface SetApprovalPolicyInput {
  id?: string | null;
  workspaceId: string;
  name: string;
  action: string;
  effect: string;
  priority?: number | null;
  subject?: Prisma.InputJsonValue | null;
  condition?: Prisma.InputJsonValue | null;
  enabled?: boolean | null;
}

/** Create or update a policy. `id` present → update (scoped to the workspace); else create. */
export async function setApprovalPolicy(input: SetApprovalPolicyInput): Promise<ApprovalPolicy> {
  const name = input.name?.trim();
  if (!name) badRequest("name is required");
  const action = input.action?.trim();
  if (!action) badRequest("action is required");
  if (!EFFECTS.has(input.effect as ApprovalEffect)) {
    badRequest(`effect must be one of: ${APPROVAL_EFFECTS.join(", ")}`);
  }

  const data = {
    name,
    action,
    effect: input.effect as ApprovalEffect,
    priority: input.priority ?? 0,
    subject: input.subject ?? Prisma.JsonNull,
    condition: input.condition ?? Prisma.JsonNull,
    ...(input.enabled == null ? {} : { enabled: input.enabled }),
  };

  if (input.id) {
    const existing = await prisma.approvalPolicy.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!existing) badRequest("policy not found");
    return prisma.approvalPolicy.update({ where: { id: input.id }, data });
  }
  return prisma.approvalPolicy.create({ data: { workspaceId: input.workspaceId, ...data } });
}

/** Delete a policy (workspace-scoped). Returns true if a row was removed. */
export async function deleteApprovalPolicy(id: string, workspaceId: string): Promise<boolean> {
  const res = await prisma.approvalPolicy.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

// ─── Evaluation + enforcement ─────────────────────────────────────

/** Load the workspace's ENABLED policies and resolve an action's effect via the pure evaluator. */
export async function resolveApprovalPolicy(
  workspaceId: string,
  ctx: ApprovalPolicyContext,
): Promise<ApprovalPolicyDecision> {
  const rows = await prisma.approvalPolicy.findMany({ where: { workspaceId, enabled: true } });
  return evaluateApprovalPolicy(rows.map(toRule), ctx);
}

/** Map a gated action to the Approval.subjectType enum used when an Approval must be created. */
function actionToSubjectType(action: string): ApprovalSubjectType {
  switch (action) {
    case "hire_agent":
      return ApprovalSubjectTypeConst.HIRE_AGENT as ApprovalSubjectType;
    case "spend_over":
      return ApprovalSubjectTypeConst.BUDGET_OVERRIDE as ApprovalSubjectType;
    default:
      return ApprovalSubjectTypeConst.AGENT_ACTION as ApprovalSubjectType;
  }
}

export type ApprovalGateResult =
  | { status: "allow"; matchedPolicyId: string }
  | { status: "require_approval"; matchedPolicyId: string; approvalId: string }
  | { status: "default"; matchedPolicyId: null };

export interface EnforceApprovalInput {
  workspaceId: string;
  ctx: ApprovalPolicyContext;
  requestedById: string; // Profile id
  title: string;
  reason?: string | null;
  subjectId?: string | null;
  taskId?: string | null;
}

/**
 * Consult the policy engine for a gated action and act on the effect. `deny` throws a readable error;
 * `require_approval` creates a pending Approval and returns its id; a matched `allow` proceeds; NO MATCH
 * returns `{status:"default"}` so the caller can apply the existing coarse behavior.
 */
export async function enforceApprovalPolicy(
  input: EnforceApprovalInput,
): Promise<ApprovalGateResult> {
  const decision = await resolveApprovalPolicy(input.workspaceId, input.ctx);

  if (decision.effect === "deny") {
    const name = await policyName(decision.matchedPolicyId);
    badRequest(
      `Action "${input.ctx.action}" is denied by approval policy${name ? ` "${name}"` : ""}.`,
    );
  }

  if (decision.effect === "require_approval") {
    const approval = await createApproval({
      workspaceId: input.workspaceId,
      subjectType: actionToSubjectType(input.ctx.action),
      subjectId: input.subjectId ?? input.ctx.agentId ?? input.ctx.action,
      taskId: input.taskId ?? null,
      title: input.title,
      reason: input.reason ?? `Requires approval per policy (${input.ctx.action}).`,
      requestedById: input.requestedById,
      payload: {
        action: input.ctx.action,
        matchedPolicyId: decision.matchedPolicyId,
        agentId: input.ctx.agentId ?? null,
        agentRole: input.ctx.agentRole ?? null,
        trustLevel: input.ctx.trustLevel ?? null,
        costCents: input.ctx.costCents ?? null,
      },
    });
    return {
      status: "require_approval",
      matchedPolicyId: decision.matchedPolicyId as string,
      approvalId: approval.id,
    };
  }

  // effect === "allow"
  if (decision.matchedPolicyId) {
    return { status: "allow", matchedPolicyId: decision.matchedPolicyId };
  }
  return { status: "default", matchedPolicyId: null };
}

export interface RequestAgentActionInput {
  workspaceId: string;
  action: string;
  requestedById: string; // Profile id
  agentId?: string | null;
  costCents?: number | null;
  title?: string | null;
  reason?: string | null;
  taskId?: string | null;
}

/**
 * The approval path entrypoint for a gated agent action. Loads the agent's role + trust level (when an
 * agentId is given), consults the policy engine, and — when NO policy matches — falls back to the
 * EXISTING coarse governance (`requireAgentApproval`): coarse-on ⇒ create an Approval, coarse-off ⇒
 * allow. So policies layer on top of, and never silently weaken, the pre-existing behavior.
 */
export async function requestAgentAction(
  input: RequestAgentActionInput,
): Promise<ApprovalGateResult> {
  let agentRole: string | null = null;
  let trustLevel: ApprovalPolicyContext["trustLevel"] = null;
  if (input.agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId, workspaceId: input.workspaceId },
      select: { role: true, trustLevel: true },
    });
    if (!agent) badRequest("agent not found in workspace");
    agentRole = agent.role;
    trustLevel = agent.trustLevel as ApprovalPolicyContext["trustLevel"];
  }

  const ctx: ApprovalPolicyContext = {
    action: input.action,
    agentId: input.agentId ?? null,
    agentRole,
    trustLevel,
    costCents: input.costCents ?? null,
  };
  const title = input.title ?? `Approve agent action: ${input.action}`;

  const result = await enforceApprovalPolicy({
    workspaceId: input.workspaceId,
    ctx,
    requestedById: input.requestedById,
    title,
    reason: input.reason ?? null,
    subjectId: input.agentId ?? null,
    taskId: input.taskId ?? null,
  });

  // A policy decided (allow / require_approval) — done. Only fall back on NO match.
  if (result.status !== "default") return result;

  // No policy matched → existing coarse behavior.
  const { requireAgentApproval } = await getAgentGovernance(input.workspaceId);
  if (!requireAgentApproval) return { status: "default", matchedPolicyId: null };

  const approval = await createApproval({
    workspaceId: input.workspaceId,
    subjectType: actionToSubjectType(input.action),
    subjectId: input.agentId ?? input.action,
    taskId: input.taskId ?? null,
    title,
    reason: input.reason ?? `Requires approval (workspace requires agent approval).`,
    requestedById: input.requestedById,
    payload: { action: input.action, agentId: input.agentId ?? null, coarse: true },
  });
  return { status: "require_approval", matchedPolicyId: "", approvalId: approval.id };
}

async function policyName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const row = await prisma.approvalPolicy.findUnique({ where: { id }, select: { name: true } });
  return row?.name ?? null;
}
