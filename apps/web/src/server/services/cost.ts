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
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/prisma";
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
  source?: string;
  idempotencyKey?: string | null;
  occurredAt?: Date;
}

/**
 * Atomically create-or-increment the QuotaWindow for `policyId` in the window containing
 * `occurredAt`, by `amountCents`. Uses `INSERT … ON CONFLICT DO UPDATE` so concurrent
 * ingestion never loses a write and never creates duplicate window rows (race-safe).
 */
async function incrementQuotaWindow(
  workspaceId: string,
  policyId: string,
  window: BudgetWindow,
  occurredAt: Date,
  amountCents: number,
): Promise<void> {
  const { windowStart, windowEnd } = windowBounds(window, occurredAt);
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "quota_windows"
      ("id", "workspaceId", "policyId", "windowStart", "windowEnd", "spendCents", "breached", "updatedAt")
    VALUES (${id}, ${workspaceId}, ${policyId}, ${windowStart}, ${windowEnd}, ${amountCents}, false, now())
    ON CONFLICT ("policyId", "windowStart")
    DO UPDATE SET
      "spendCents" = "quota_windows"."spendCents" + ${amountCents},
      "updatedAt" = now()
  `;
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
