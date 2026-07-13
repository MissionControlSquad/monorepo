/**
 * Agent trust decision (Epic #3) — shared pure logic. Import from @agentcenter/utils. Agent-domain
 * governance (not human RBAC). The web service loads the profile and calls evaluateTrust.
 */
export type TrustLevel = "untrusted" | "low" | "standard" | "trusted";
export type TrustCheckKind = "host_write" | "pr_merge" | "command";

export interface TrustProfileEval {
  trustLevel: TrustLevel;
  lowTrustContainment: boolean;
  requireUntrustedPrReview: boolean;
  changeConsentRequired: boolean;
  executionAllowlist: string[];
}
export interface TrustDecision {
  allowed: boolean;
  reason: string;
}

/** Pure trust decision — no I/O. */
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
  if (profile.requireUntrustedPrReview && kind === "pr_merge" && profile.trustLevel === "untrusted") {
    return { allowed: false, reason: "Untrusted agent PR requires review before merge" };
  }
  return { allowed: true, reason: "allowed" };
}
