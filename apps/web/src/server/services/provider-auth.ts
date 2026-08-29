import { prisma } from "@/server/prisma";
import type { ProviderAuthState as ProviderAuthStateRow } from "@agentcenter/database";
import { classifyProviderAuth, type ProviderAuthClassification } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// Provider auth reconciliation (parity #25). Track an AI provider credential's auth state and decide the
// reconciliation action (refresh / reauth) before a run. The refresh/validate network call is the infra
// seam; this owns the tracked state + classification. Workspace-scoped.

/** Record/observe a provider credential's auth facts, recomputing its state. */
export async function recordProviderAuth(input: {
  workspaceId: string;
  provider: string;
  accountRef: string;
  expiresAt?: Date | null;
  scopes?: string[];
  revoked?: boolean;
  error?: string | null;
}): Promise<ProviderAuthStateRow> {
  if (!input.provider?.trim()) badRequest("provider is required");
  if (!input.accountRef?.trim()) badRequest("accountRef is required");
  const cls = classifyProviderAuth({
    revoked: input.revoked,
    expiresAt: input.expiresAt ?? null,
    now: Date.now(),
  });
  const data = {
    state: cls.state,
    scopes: input.scopes ?? [],
    expiresAt: input.expiresAt ?? null,
    revoked: input.revoked ?? false,
    lastCheckedAt: new Date(),
    lastError: input.error ?? null,
  };
  return prisma.providerAuthState.upsert({
    where: {
      workspaceId_provider_accountRef: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        accountRef: input.accountRef,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      accountRef: input.accountRef,
      ...data,
    },
    update: data,
  });
}

/**
 * Reconcile a credential: recompute its classification from the stored facts as of now, persist the
 * (possibly changed) state, and return the action the runtime should take (none/refresh/reauth).
 */
export async function reconcileProviderAuth(
  workspaceId: string,
  provider: string,
  accountRef: string,
): Promise<{ row: ProviderAuthStateRow; classification: ProviderAuthClassification }> {
  const row = await prisma.providerAuthState.findUnique({
    where: { workspaceId_provider_accountRef: { workspaceId, provider, accountRef } },
  });
  if (!row) badRequest("Provider auth state not found");
  const classification = classifyProviderAuth({
    revoked: row.revoked,
    expiresAt: row.expiresAt,
    now: Date.now(),
  });
  const updated =
    classification.state === row.state
      ? row
      : await prisma.providerAuthState.update({
          where: { id: row.id },
          data: { state: classification.state, lastCheckedAt: new Date() },
        });
  return { row: updated, classification };
}

export function listProviderAuthStates(
  workspaceId: string,
  opts: { provider?: string; needsAttention?: boolean } = {},
): Promise<ProviderAuthStateRow[]> {
  return prisma.providerAuthState.findMany({
    where: {
      workspaceId,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.needsAttention ? { state: { in: ["expiring", "expired", "revoked"] } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
}
