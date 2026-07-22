// Provider auth reconciliation (parity #25, pure half). AI-agent runtime providers (Codex/OpenAI, etc.)
// hold credentials that expire or get revoked. This PURE classifier decides, from an expiry + last-check,
// what reconciliation action is due — the actual token refresh / validation call is the infra seam. In
// scope for the monorepo (AI-agent layer), not buildbase (which owns human auth).

export type ProviderAuthState = "valid" | "expiring" | "expired" | "revoked" | "unknown";
export type ProviderAuthAction = "none" | "refresh" | "reauth";

export interface ProviderAuthClassification {
  state: ProviderAuthState;
  action: ProviderAuthAction;
  reason: string;
}

/**
 * Classify a provider credential:
 * - explicitly revoked → revoked / reauth
 * - no expiry known → unknown / none (opaque token; validated out-of-band)
 * - past expiry → expired / reauth
 * - within the refresh window → expiring / refresh
 * - otherwise → valid / none
 */
export function classifyProviderAuth(input: {
  revoked?: boolean;
  expiresAt?: Date | null;
  now: number;
  refreshWindowMs?: number;
}): ProviderAuthClassification {
  if (input.revoked)
    return { state: "revoked", action: "reauth", reason: "credential revoked" };
  if (!input.expiresAt)
    return { state: "unknown", action: "none", reason: "no expiry known" };

  const refreshWindow = input.refreshWindowMs ?? 10 * 60_000; // refresh 10 min before expiry
  const msLeft = input.expiresAt.getTime() - input.now;
  if (msLeft <= 0) return { state: "expired", action: "reauth", reason: "credential expired" };
  if (msLeft <= refreshWindow)
    return {
      state: "expiring",
      action: "refresh",
      reason: `expires in ${Math.ceil(msLeft / 60_000)}m`,
    };
  return { state: "valid", action: "none", reason: "credential valid" };
}
