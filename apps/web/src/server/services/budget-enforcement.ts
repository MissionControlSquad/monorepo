/**
 * Budget breach enforcement (Epic #4, Paperclip parity). Runs OFF the event bus (never in the
 * hot ingestion write): `events/handlers/budget.ts` calls `checkBreach` for each policy a cost
 * touched.
 *
 * Two thresholds per window (mirrors Paperclip's soft/hard model):
 *  - SOFT warn: spend reaches `warnPercent`% of the limit → open a soft incident + notify, NO pause.
 *  - HARD breach: spend reaches the limit → open a hard incident; when `hardStop`, cancel the
 *    agent's in-flight work and auto-pause it (`AgentStatus.blocked`), and open a `budget_override`
 *    Approval that gates resume. A hard breach supersedes the soft warn for the same window.
 *
 * Each threshold fires at most once per window (atomic first-crossing claim on the QuotaWindow).
 */
import { prisma } from "@/server/prisma";
import type { AgentStatusValue } from "@/server/constants";
import { EventTypes } from "@/server/constants";
import { emit } from "@/server/events";
import { applyAgentStatusUpdate } from "@/server/agent-status";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { createApproval } from "@/server/services/approvals";
import { windowBounds } from "./budget-window";

export const AUTO_PAUSE_MESSAGE = "Auto-paused: budget limit reached";

/** Pure hard-breach predicate — reaching the limit counts. Unit-testable, no I/O. */
export function isBreached(spendCents: number, limitCents: number): boolean {
  return spendCents >= limitCents;
}

/** Soft-warn threshold in cents for a limit + warn percent. */
export function warnThresholdCents(limitCents: number, warnPercent: number): number {
  return (limitCents * warnPercent) / 100;
}

type PolicyRow = NonNullable<Awaited<ReturnType<typeof prisma.budgetPolicy.findUnique>>>;

/** Agents to pause on a hard breach: the one agent (agent scope) or all active workspace agents. */
async function agentsToPause(policy: PolicyRow): Promise<string[]> {
  if (!policy.hardStop) return [];
  if (policy.scope === "agent") return policy.agentId ? [policy.agentId] : [];
  const agents = await prisma.agent.findMany({
    where: { workspaceId: policy.workspaceId, status: { not: "blocked" } },
    select: { id: true },
  });
  return agents.map((a) => a.id);
}

async function openHardIncident(policy: PolicyRow, spendCents: number): Promise<void> {
  const agentId = policy.scope === "agent" ? policy.agentId : null;
  const pausedAgentIds = await agentsToPause(policy);

  const incident = await prisma.budgetIncident.create({
    data: {
      workspaceId: policy.workspaceId,
      policyId: policy.id,
      agentId,
      thresholdType: "hard",
      spendCents,
      limitCents: policy.limitCents,
      autoPaused: policy.hardStop && pausedAgentIds.length > 0,
      detail: `Budget "${policy.name}" reached ${spendCents}/${policy.limitCents} cents${
        policy.hardStop ? " — agents paused" : ""
      }`,
    },
  });

  // Cancel in-flight work AND pause (mirrors Paperclip cancelWorkForScope + pause).
  for (const id of pausedAgentIds) {
    await applyAgentStatusUpdate(id, {
      status: "blocked" as AgentStatusValue,
      statusMessage: AUTO_PAUSE_MESSAGE,
      currentTaskId: null,
      currentTask: null,
    });
  }

  // Open a budget_override approval that gates resume (agent scope: the agent requests the raise).
  if (policy.hardStop && agentId) {
    const requestedById = await getOrCreateAgentProfileId(agentId);
    const approval = await createApproval({
      workspaceId: policy.workspaceId,
      subjectType: "budget_override",
      subjectId: incident.id,
      title: `Raise budget "${policy.name}" to resume paused agent`,
      reason: `Hard budget limit reached (${spendCents}/${policy.limitCents} cents).`,
      requestedById,
    });
    await prisma.budgetIncident.update({
      where: { id: incident.id },
      data: { approvalId: approval.id },
    });
  }

  await emit({
    type: EventTypes.BUDGET_INCIDENT_OPENED,
    incidentId: incident.id,
    workspaceId: policy.workspaceId,
    policyId: policy.id,
    agentId: agentId ?? undefined,
    thresholdType: "hard",
    spendCents,
    limitCents: policy.limitCents,
    autoPaused: incident.autoPaused,
  });
}

async function openSoftIncident(policy: PolicyRow, spendCents: number): Promise<void> {
  const agentId = policy.scope === "agent" ? policy.agentId : null;
  const incident = await prisma.budgetIncident.create({
    data: {
      workspaceId: policy.workspaceId,
      policyId: policy.id,
      agentId,
      thresholdType: "soft",
      spendCents,
      limitCents: policy.limitCents,
      autoPaused: false,
      detail: `Budget "${policy.name}" at ${spendCents}/${policy.limitCents} cents (warn ${policy.warnPercent}%)`,
    },
  });

  await emit({
    type: EventTypes.BUDGET_INCIDENT_OPENED,
    incidentId: incident.id,
    workspaceId: policy.workspaceId,
    policyId: policy.id,
    agentId: agentId ?? undefined,
    thresholdType: "soft",
    spendCents,
    limitCents: policy.limitCents,
    autoPaused: false,
  });
}

/**
 * Evaluate the policy's current window for the soft-warn and hard-breach thresholds. Each fires
 * at most once per window (atomic claim). A hard breach also claims `warned` so no redundant soft
 * incident opens for the same window.
 */
export async function checkBreach(policyId: string, at: Date): Promise<void> {
  const policy = await prisma.budgetPolicy.findUnique({ where: { id: policyId } });
  if (!policy || !policy.isActive) return;

  const { windowStart } = windowBounds(policy.window, at);
  const qw = await prisma.quotaWindow.findUnique({
    where: { policyId_windowStart: { policyId, windowStart } },
  });
  if (!qw) return;

  // HARD breach (reaching the limit) — supersedes soft.
  if (isBreached(qw.spendCents, policy.limitCents)) {
    const claim = await prisma.quotaWindow.updateMany({
      where: { id: qw.id, breached: false },
      data: { breached: true, warned: true },
    });
    if (claim.count === 0) return;
    await openHardIncident(policy, qw.spendCents);
    return;
  }

  // SOFT warn (reaching warnPercent% of the limit).
  if (qw.spendCents >= warnThresholdCents(policy.limitCents, policy.warnPercent)) {
    const claim = await prisma.quotaWindow.updateMany({
      where: { id: qw.id, warned: false },
      data: { warned: true },
    });
    if (claim.count === 0) return;
    await openSoftIncident(policy, qw.spendCents);
  }
}
