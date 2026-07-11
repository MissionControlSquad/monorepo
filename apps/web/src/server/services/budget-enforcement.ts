/**
 * Budget breach enforcement (Epic #4). Runs OFF the event bus (never in the hot ingestion
 * write): `events/handlers/budget.ts` calls `checkBreach` for each policy a cost touched.
 *
 * A window is breached when running spend REACHES the limit (`spend >= limit`). The first
 * breach of a window is claimed atomically (so concurrent handlers open exactly one
 * incident), and when the policy is `hardStop` the affected agent(s) are auto-paused by
 * reusing `applyAgentStatusUpdate` → `AgentStatus.blocked` (no new pause mechanism, D-guardrail).
 */
import { prisma } from "@/server/prisma";
import type { AgentStatusValue } from "@/server/constants";
import { EventTypes } from "@/server/constants";
import { emit } from "@/server/events";
import { applyAgentStatusUpdate } from "@/server/agent-status";
import { windowBounds } from "./budget-window";

export const AUTO_PAUSE_MESSAGE = "Auto-paused: budget limit reached";

/** Pure breach predicate — reaching the limit counts as a breach. Unit-testable, no I/O. */
export function isBreached(spendCents: number, limitCents: number): boolean {
  return spendCents >= limitCents;
}

/**
 * Evaluate the policy's current window for breach. On a first breach: mark the window
 * `breached`, open exactly one `BudgetIncident`, and (when `hardStop`) auto-pause the
 * affected agent(s). Idempotent — a window already breached opens no second incident and
 * re-pauses nothing.
 */
export async function checkBreach(policyId: string, at: Date): Promise<void> {
  const policy = await prisma.budgetPolicy.findUnique({ where: { id: policyId } });
  if (!policy || !policy.isActive) return;

  const { windowStart } = windowBounds(policy.window, at);
  const qw = await prisma.quotaWindow.findUnique({
    where: { policyId_windowStart: { policyId, windowStart } },
  });
  if (!qw) return;
  if (!isBreached(qw.spendCents, policy.limitCents)) return;

  // Atomically claim the first-breach transition: only the handler that flips breached
  // false→true proceeds to open the incident. Concurrent handlers see count 0 and bail.
  const claim = await prisma.quotaWindow.updateMany({
    where: { id: qw.id, breached: false },
    data: { breached: true },
  });
  if (claim.count === 0) return;

  const agentId = policy.scope === "agent" ? policy.agentId : null;

  // Determine which agents to pause BEFORE creating the incident (only when hardStop).
  let pausedAgentIds: string[] = [];
  if (policy.hardStop) {
    if (policy.scope === "agent") {
      pausedAgentIds = policy.agentId ? [policy.agentId] : [];
    } else {
      const agents = await prisma.agent.findMany({
        where: { workspaceId: policy.workspaceId, status: { not: "blocked" } },
        select: { id: true },
      });
      pausedAgentIds = agents.map((a) => a.id);
    }
  }

  const incident = await prisma.budgetIncident.create({
    data: {
      workspaceId: policy.workspaceId,
      policyId: policy.id,
      quotaWindowId: qw.id,
      agentId,
      spendCents: qw.spendCents,
      limitCents: policy.limitCents,
      autoPaused: policy.hardStop && pausedAgentIds.length > 0,
      detail: policy.hardStop
        ? `Budget "${policy.name}" reached ${qw.spendCents}/${policy.limitCents} cents — agents paused`
        : `Budget "${policy.name}" reached ${qw.spendCents}/${policy.limitCents} cents`,
    },
  });

  if (policy.hardStop) {
    for (const id of pausedAgentIds) {
      await applyAgentStatusUpdate(id, {
        status: "blocked" as AgentStatusValue,
        statusMessage: AUTO_PAUSE_MESSAGE,
      });
    }
  }

  await emit({
    type: EventTypes.BUDGET_INCIDENT_OPENED,
    incidentId: incident.id,
    workspaceId: policy.workspaceId,
    policyId: policy.id,
    agentId: agentId ?? undefined,
    spendCents: qw.spendCents,
    limitCents: policy.limitCents,
    autoPaused: incident.autoPaused,
  });
}
