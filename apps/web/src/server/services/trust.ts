/**
 * Agent trust service (Epic #3) — agent-domain governance. Not human RBAC (that's buildbase, D1).
 */
import { prisma } from "@/server/prisma";
import type { TrustLevel } from "@agentcenter/database";

// The pure trust decision + its types are shared in @agentcenter/utils (web/desktop/mobile).
// Imported for internal use here and re-exported for existing importers.
import { evaluateTrust } from "@agentcenter/utils";
import type { TrustCheckKind, TrustDecision, TrustProfileEval } from "@agentcenter/utils";
export { evaluateTrust };
export type { TrustCheckKind, TrustDecision, TrustProfileEval };

export interface SetTrustProfileInput {
  agentId: string;
  workspaceId: string;
  trustLevel?: TrustLevel;
  lowTrustContainment?: boolean;
  requireUntrustedPrReview?: boolean;
  autoPromoteWorkProduct?: boolean;
  sourceTrustBadge?: string | null;
  changeConsentRequired?: boolean;
  executionAllowlist?: string[];
}

export function getTrustProfile(agentId: string) {
  return prisma.agentTrustProfile.findUnique({ where: { agentId } });
}

/** Upsert the trust profile AND keep the denormalized Agent.trustLevel cache in sync (one txn). */
export async function setTrustProfile(input: SetTrustProfileInput) {
  const { agentId, workspaceId, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    const profile = await tx.agentTrustProfile.upsert({
      where: { agentId },
      create: { agentId, workspaceId, ...fields },
      update: fields,
    });
    await tx.agent.update({ where: { id: agentId }, data: { trustLevel: profile.trustLevel } });
    return profile;
  });
}

/** Whether an agent may perform `action` of the given `kind`, per its trust profile. */
export async function isActionAllowed(
  agentId: string,
  action: string,
  kind: TrustCheckKind,
): Promise<TrustDecision> {
  const profile = await getTrustProfile(agentId);
  return evaluateTrust(profile, action, kind);
}
