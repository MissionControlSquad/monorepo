/**
 * Cost recording service (Epic #4). The SINGLE funnel for all agent/VM/manual cost:
 * REST `POST /api/cost-events`, the agent heartbeat `costDelta`, the GraphQL `ingestCostEvent`
 * mutation, and the cloud-VM cron feed all call `recordCostEvent`.
 *
 * Hot path is intentionally small: (1) insert the immutable `CostEvent`, (2) atomically
 * upsert-increment the running `QuotaWindow.spendCents` for every matching active policy,
 * (3) emit `COST_EVENT_RECORDED`. Breach evaluation + auto-pause run OFF the bus
 * (`events/handlers/budget.ts` → `checkBreach`), never synchronously in this write.
 */
import { prisma } from "@/server/prisma";
import { normalizeBillingType } from "@agentcenter/utils";
import type { BudgetScope, BudgetWindow, CostEvent } from "@agentcenter/database";
import { Prisma } from "@agentcenter/database";
import { emit } from "@/server/events";
import { EventTypes } from "@/server/constants";
import { windowBounds } from "./budget-window";

export interface RecordCostEventInput {
  workspaceId: string;
  agentId?: string | null;
  model?: string | null;
  provider?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  billerId?: string | null;
  issueId?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  amountCents: number;
  billingType?: string;
  source?: string;
  idempotencyKey?: string | null;
  occurredAt?: Date;
}

/**
 * Atomically create-or-increment the QuotaWindow for `policyId` in the window containing
 * `occurredAt`, by `amountCents`. Race-safe: the per-row `{ increment }` UPDATE is atomic
 * under concurrency (row lock), and the first-create race is resolved by catching the
 * unique-constraint violation and looping back to the increment path. Uses the ORM (not raw
 * SQL) so `windowStart` round-trips through Prisma's DateTime handling consistently.
 */
async function incrementQuotaWindow(
  workspaceId: string,
  policyId: string,
  window: BudgetWindow,
  occurredAt: Date,
  amountCents: number,
): Promise<void> {
  const { windowStart, windowEnd } = windowBounds(window, occurredAt);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.quotaWindow.findUnique({
      where: { policyId_windowStart: { policyId, windowStart } },
    });
    if (existing) {
      await prisma.quotaWindow.update({
        where: { id: existing.id },
        data: { spendCents: { increment: amountCents } },
      });
      return;
    }
    try {
      await prisma.quotaWindow.create({
        data: { workspaceId, policyId, windowStart, windowEnd, spendCents: amountCents },
      });
      return;
    } catch (err) {
      // Concurrent create won the race — loop back and increment the now-existing row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error(`incrementQuotaWindow: exhausted retries for policy ${policyId}`);
}

/**
 * Record a cost event and fan its amount into every active budget policy that applies:
 * the workspace-scope policy plus (when `agentId` is set) that agent's agent-scope policy.
 * Idempotent when `idempotencyKey` is supplied: a duplicate key returns the existing event
 * WITHOUT re-incrementing any window (prevents false breach / double auto-pause).
 */
export async function recordCostEvent(input: RecordCostEventInput): Promise<CostEvent> {
  const occurredAt = input.occurredAt ?? new Date();
  const amountCents = Math.trunc(input.amountCents);

  const data = {
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    model: input.model ?? null,
    provider: input.provider ?? null,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    billerId: input.billerId ?? null,
    issueId: input.issueId ?? null,
    tokensIn: input.tokensIn ?? 0,
    tokensOut: input.tokensOut ?? 0,
    amountCents,
    billingType: normalizeBillingType(input.billingType),
    source: input.source ?? "agent",
    idempotencyKey: input.idempotencyKey ?? null,
    occurredAt,
  };

  let costEvent: CostEvent;
  try {
    costEvent = await prisma.costEvent.create({ data });
  } catch (err) {
    // Duplicate idempotencyKey → return the already-recorded event, do NOT re-increment.
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return prisma.costEvent.findUniqueOrThrow({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
    }
    throw err;
  }

  // Find every active policy this cost feeds: the workspace budget + the agent's own budget.
  const policies = await prisma.budgetPolicy.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      OR: [
        { scope: "workspace" as BudgetScope },
        ...(input.agentId ? [{ scope: "agent" as BudgetScope, agentId: input.agentId }] : []),
      ],
    },
    select: { id: true, window: true },
  });

  for (const policy of policies) {
    await incrementQuotaWindow(
      input.workspaceId,
      policy.id,
      policy.window,
      occurredAt,
      amountCents,
    );
  }

  await emit({
    type: EventTypes.COST_EVENT_RECORDED,
    costEventId: costEvent.id,
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? undefined,
    amountCents,
    affectedPolicyIds: policies.map((p) => p.id),
    occurredAt: occurredAt.toISOString(),
  });

  return costEvent;
}
