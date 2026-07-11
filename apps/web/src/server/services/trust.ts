/**
 * Agent trust service (Epic #3) — agent-domain governance. Not human RBAC (that's buildbase, D1).
 */
import { prisma } from "@/server/prisma";
import type { TrustLevel } from "@agentcenter/database";

export type TrustCheckKind = "host_write" | "pr_merge" | "command";

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

export interface TrustDecision {
  allowed: boolean;
  reason: string;
}

/** The trust fields the decision depends on (subset of AgentTrustProfile). */
export interface TrustProfileEval {
  trustLevel: TrustLevel;
  lowTrustContainment: boolean;
  requireUntrustedPrReview: boolean;
  changeConsentRequired: boolean;
  executionAllowlist: string[];
}

/** Pure trust decision — no I/O, unit-testable. */
export function evaluateTrust(
  profile: TrustProfileEval | null,
  action: string,
  kind: TrustCheckKind,
): TrustDecision {
  if (!profile) return { allowed: true, reason: "no trust profile — default allow" };

  if (profile.changeConsentRequired && !profile.executionAllowlist.includes(action)) {
    return {
      allowed: false,
      reason: `Action '${action}' requires change consent and is not in the execution allowlist`,
    };
  }
  if (profile.lowTrustContainment && kind === "host_write") {
    return { allowed: false, reason: "Low-trust containment blocks host-write actions" };
  }
  if (
    profile.requireUntrustedPrReview &&
    kind === "pr_merge" &&
    profile.trustLevel === "untrusted"
  ) {
    return { allowed: false, reason: "Untrusted agent PR requires review before merge" };
  }
  return { allowed: true, reason: "allowed" };
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
