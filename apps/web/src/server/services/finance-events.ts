/**
 * Non-inference finance ledger service (Domain 12 GAP-1). Records + aggregates account-level provider
 * money (credit purchases/refunds, platform/BYOK fees, gateway overhead, storage/training charges,
 * manual adjustments) — distinct from CostEvent (inference) and LedgerEvent (human P&L). Workspace-
 * scoped; writes are admin-gated at the edge (these are human-entered account charges, never an agent
 * API key). Integer cents only. Idempotent ingest via (workspaceId, idempotencyKey).
 */
import { prisma } from "@/server/prisma";
import { Prisma } from "@agentcenter/database";
import type { FinanceEvent } from "@agentcenter/database";
import {
  isFinanceEventKind,
  isFinanceDirection,
  isFinanceUnit,
  summarizeFinanceEvents,
  type FinanceSummary,
} from "@agentcenter/utils";
import { badRequest } from "./service-errors";

export interface RecordFinanceEventInput {
  workspaceId: string;
  eventKind: string;
  direction?: string;
  amountCents: number;
  unit?: string;
  currency?: string;
  biller?: string | null;
  provider?: string | null;
  billingCode?: string | null;
  description?: string | null;
  quantity?: number | null;
  estimated?: boolean;
  externalInvoiceId?: string | null;
  costEventId?: string | null;
  agentId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  issueId?: string | null;
  idempotencyKey?: string | null;
  metadataJson?: Record<string, unknown> | null;
  occurredAt?: Date;
}

export async function recordFinanceEvent(input: RecordFinanceEventInput): Promise<FinanceEvent> {
  if (!isFinanceEventKind(input.eventKind))
    badRequest(`Unknown finance event kind: ${input.eventKind}`);
  const direction = input.direction ?? "debit";
  if (!isFinanceDirection(direction)) badRequest(`Invalid direction: ${direction}`);
  const unit = input.unit ?? "flat";
  if (!isFinanceUnit(unit)) badRequest(`Invalid unit: ${unit}`);
  if (!Number.isFinite(input.amountCents)) badRequest("amountCents must be a number");

  // A linked cost event must belong to this workspace (never cross-tenant attribution).
  if (input.costEventId) {
    const ce = await prisma.costEvent.findFirst({
      where: { id: input.costEventId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!ce) badRequest("costEventId does not belong to this workspace");
  }

  const data = {
    workspaceId: input.workspaceId,
    eventKind: input.eventKind,
    direction,
    unit,
    amountCents: Math.trunc(input.amountCents),
    currency: input.currency ?? "USD",
    biller: input.biller ?? null,
    provider: input.provider ?? null,
    billingCode: input.billingCode ?? null,
    description: input.description ?? null,
    quantity: input.quantity ?? null,
    estimated: input.estimated ?? false,
    externalInvoiceId: input.externalInvoiceId ?? null,
    costEventId: input.costEventId ?? null,
    agentId: input.agentId ?? null,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    issueId: input.issueId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    metadataJson: (input.metadataJson ?? undefined) as never,
    occurredAt: input.occurredAt ?? new Date(),
  };

  try {
    return await prisma.financeEvent.create({ data });
  } catch (err) {
    // Duplicate idempotencyKey → return the already-recorded event (no double-count).
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return prisma.financeEvent.findUniqueOrThrow({
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
}

interface RangeFilter {
  workspaceId: string;
  since?: Date | null;
  until?: Date | null;
}

function occurredWhere(filter: RangeFilter) {
  return {
    workspaceId: filter.workspaceId,
    ...(filter.since || filter.until
      ? {
          occurredAt: {
            ...(filter.since ? { gte: filter.since } : {}),
            ...(filter.until ? { lte: filter.until } : {}),
          },
        }
      : {}),
  };
}

/** Debit/credit/net/estimated/count over a workspace (optionally a time range). */
export async function financeSummary(filter: RangeFilter): Promise<FinanceSummary> {
  const rows = await prisma.financeEvent.findMany({
    where: occurredWhere(filter),
    select: { direction: true, amountCents: true, estimated: true },
  });
  return summarizeFinanceEvents(rows);
}

export interface FinanceGroupRow {
  key: string;
  debitCents: number;
  creditCents: number;
  netCents: number;
  count: number;
}

async function groupBy(
  filter: RangeFilter,
  field: "biller" | "eventKind",
): Promise<FinanceGroupRow[]> {
  const rows = await prisma.financeEvent.findMany({
    where: occurredWhere(filter),
    select: { biller: true, eventKind: true, direction: true, amountCents: true },
  });
  const map = new Map<string, FinanceGroupRow>();
  for (const r of rows) {
    const key = (field === "biller" ? r.biller : r.eventKind) ?? "(unspecified)";
    const g = map.get(key) ?? { key, debitCents: 0, creditCents: 0, netCents: 0, count: 0 };
    const cents = r.amountCents;
    if (r.direction === "credit") g.creditCents += cents;
    else g.debitCents += cents;
    g.netCents = g.debitCents - g.creditCents;
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

export const financeByBiller = (f: RangeFilter) => groupBy(f, "biller");
export const financeByKind = (f: RangeFilter) => groupBy(f, "eventKind");

/** Recent finance events, newest first. */
export function listFinanceEvents(filter: RangeFilter, limit = 50): Promise<FinanceEvent[]> {
  return prisma.financeEvent.findMany({
    where: occurredWhere(filter),
    orderBy: { occurredAt: "desc" },
    take: Math.min(limit, 200),
  });
}
