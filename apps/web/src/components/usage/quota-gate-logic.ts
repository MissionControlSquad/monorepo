import type { IQuotaUsageStatus } from "@buildbase/sdk/react";

/**
 * Pure gating logic for HUMAN plan quotas (Epic #1). Extracted from the React component so it can be
 * unit-tested without a provisioned buildbase org (SDK hooks are no-op fallbacks otherwise).
 *
 * States:
 *  - `unknown`   → don't gate. buildbase dormant OR the plan defines no such quota → treat as
 *                   unlimited and preserve current (ungated) behavior.
 *  - `loading`   → quota status is being fetched.
 *  - `exhausted` → at a HARD plan limit (no units left and overage not allowed). Block + upsell.
 *  - `available` → units remain (or overage is allowed) → allow the action.
 */
export type QuotaGateState = "unknown" | "loading" | "exhausted" | "available";

export interface QuotaGateInput {
  /** Whether the buildbase provider is mounted (configured). When false → never gate. */
  ready: boolean;
  loading: boolean;
  /** Quota status from `useQuotaUsageStatus`, or null when the plan exposes no such quota. */
  status: Pick<IQuotaUsageStatus, "available" | "allowOverage"> | null;
}

export function evaluateQuotaGate({ ready, loading, status }: QuotaGateInput): QuotaGateState {
  if (!ready) return "unknown";
  if (loading) return "loading";
  if (!status) return "unknown";
  // Hard cap only: no units remaining AND the plan disallows overage. When overage is allowed the
  // action stays available (it's billed as overage), matching buildbase's own semantics.
  if (status.available <= 0 && status.allowOverage === false) return "exhausted";
  return "available";
}

/** Fraction consumed (0..1+, clamped at 0 lower bound), for progress bars. Overage can exceed 1. */
export function quotaConsumedFraction(
  status: Pick<IQuotaUsageStatus, "consumed" | "included">,
): number {
  if (!status.included || status.included <= 0) return 0;
  return Math.max(0, status.consumed / status.included);
}
