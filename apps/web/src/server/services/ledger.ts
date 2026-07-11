/**
 * Business finance ledger service (Epic #16). Human-owned P&L bookkeeping — workspace-scoped
 * writes, integer cents only, NO agent path. Kept entirely separate from Epic #4 agent cost.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { LedgerEvent, LedgerCategory, LedgerKind, LedgerSource } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** amountCents must be a positive integer (sign is carried by `kind`, never the amount). */
export function validateAmountCents(n: number): void {
  if (!Number.isInteger(n) || n <= 0) badRequest("amountCents must be a positive integer");
}

/** Normalize + validate an ISO-4217 currency code (3 uppercase letters). */
export function normalizeCurrency(c?: string | null): string {
  const cur = (c ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) badRequest("currency must be a 3-letter ISO-4217 code");
  return cur;
}

/** Pure integer-cents summary reducer (no floats). Net = revenue − expense. */
export function reduceSummary(rows: { kind: LedgerKind; amountCents: number }[]): {
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  eventCount: number;
} {
  let revenueCents = 0;
  let expenseCents = 0;
  for (const r of rows) {
    if (r.kind === "revenue") revenueCents += r.amountCents;
    else expenseCents += r.amountCents;
  }
  return {
    revenueCents,
    expenseCents,
    netCents: revenueCents - expenseCents,
    eventCount: rows.length,
  };
}

/** Resolve the snapshot category label for an event, enforcing kind-coherence with a referenced category. */
async function resolveCategoryLabel(args: {
  workspaceId: string;
  kind: LedgerKind;
  category?: string | null;
  categoryId?: string | null;
}): Promise<string> {
  if (args.categoryId) {
    const cat = await prisma.ledgerCategory.findFirst({
      where: { id: args.categoryId, workspaceId: args.workspaceId },
    });
    if (!cat) badRequest("categoryId not found in this workspace");
    if (cat.kind !== args.kind)
      badRequest(`category kind (${cat.kind}) does not match event kind (${args.kind})`);
    return cat.name;
  }
  const label = args.category?.trim();
  if (!label) badRequest("category is required");
  return label;
}

export interface CreateLedgerEventInput {
  workspaceId: string;
  createdBy: string;
  kind: LedgerKind;
  category?: string | null;
  categoryId?: string | null;
  biller?: string | null;
  amountCents: number;
  currency?: string | null;
  description?: string | null;
  projectId?: string | null;
  source?: LedgerSource | null;
  occurredAt: Date;
}

export async function createLedgerEvent(input: CreateLedgerEventInput): Promise<LedgerEvent> {
  validateAmountCents(input.amountCents);
  const currency = normalizeCurrency(input.currency);
  const category = await resolveCategoryLabel(input);
  return prisma.ledgerEvent.create({
    data: {
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      kind: input.kind,
      category,
      categoryId: input.categoryId ?? null,
      biller: input.biller ?? null,
      amountCents: input.amountCents,
      currency,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      source: input.source ?? "manual",
      occurredAt: input.occurredAt,
    },
  });
}

export interface UpdateLedgerEventInput {
  kind?: LedgerKind | null;
  category?: string | null;
  categoryId?: string | null;
  biller?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  description?: string | null;
  projectId?: string | null;
  occurredAt?: Date | null;
}

export async function updateLedgerEvent(
  workspaceId: string,
  id: string,
  patch: UpdateLedgerEventInput,
): Promise<LedgerEvent> {
  const existing = await prisma.ledgerEvent.findFirst({ where: { id, workspaceId } });
  if (!existing)
    throw new GraphQLError("Ledger event not found", { extensions: { code: "NOT_FOUND" } });

  if (patch.amountCents != null) validateAmountCents(patch.amountCents);
  const currency = patch.currency != null ? normalizeCurrency(patch.currency) : undefined;

  const kind = patch.kind ?? existing.kind;
  // Re-snapshot the category label when the reference or kind changes.
  let category: string | undefined;
  let categoryId: string | null | undefined;
  if (patch.categoryId !== undefined || patch.category != null || patch.kind != null) {
    category = await resolveCategoryLabel({
      workspaceId,
      kind,
      category: patch.category ?? undefined,
      categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    });
    categoryId = patch.categoryId !== undefined ? patch.categoryId : undefined;
  }

  return prisma.ledgerEvent.update({
    where: { id },
    data: {
      ...(patch.kind != null ? { kind: patch.kind } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(patch.biller !== undefined ? { biller: patch.biller } : {}),
      ...(patch.amountCents != null ? { amountCents: patch.amountCents } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.occurredAt != null ? { occurredAt: patch.occurredAt } : {}),
    },
  });
}

export async function deleteLedgerEvent(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.ledgerEvent.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

export async function createLedgerCategory(input: {
  workspaceId: string;
  createdBy: string;
  kind: LedgerKind;
  name: string;
}): Promise<LedgerCategory> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  const dup = await prisma.ledgerCategory.findFirst({
    where: { workspaceId: input.workspaceId, kind: input.kind, name },
  });
  if (dup) badRequest(`a ${input.kind} category named "${name}" already exists`);
  return prisma.ledgerCategory.create({
    data: { workspaceId: input.workspaceId, createdBy: input.createdBy, kind: input.kind, name },
  });
}

export async function updateLedgerCategory(
  workspaceId: string,
  id: string,
  patch: { name?: string | null; archived?: boolean | null },
): Promise<LedgerCategory> {
  const existing = await prisma.ledgerCategory.findFirst({ where: { id, workspaceId } });
  if (!existing)
    throw new GraphQLError("Category not found", { extensions: { code: "NOT_FOUND" } });
  const name = patch.name != null ? patch.name.trim() : undefined;
  if (name !== undefined && !name) badRequest("name cannot be empty");
  return prisma.ledgerCategory.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(patch.archived != null ? { archived: patch.archived } : {}),
    },
  });
}
