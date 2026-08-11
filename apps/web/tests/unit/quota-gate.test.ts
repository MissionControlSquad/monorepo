import { describe, it, expect } from "vitest";
import { evaluateQuotaGate, quotaConsumedFraction } from "@/components/usage/quota-gate-logic";
import { metaForSlug, USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";

/**
 * Unit tests for the pure HUMAN plan-quota gating logic (Epic #1). SDK hooks are no-op fallbacks
 * without a provisioned org, so the component's behavior is proven via this extracted pure function.
 */

const status = (o: Partial<{ available: number; allowOverage: boolean }>) => ({
  available: 0,
  allowOverage: false,
  ...o,
});

describe("evaluateQuotaGate", () => {
  it("never gates when buildbase is not ready (dormant) — preserves current behavior", () => {
    expect(
      evaluateQuotaGate({ ready: false, loading: false, status: status({ available: 0 }) }),
    ).toBe("unknown");
  });

  it("never gates when the plan defines no such quota (status null → unlimited)", () => {
    expect(evaluateQuotaGate({ ready: true, loading: false, status: null })).toBe("unknown");
  });

  it("reports loading while status is being fetched", () => {
    expect(evaluateQuotaGate({ ready: true, loading: true, status: null })).toBe("loading");
  });

  it("is available when units remain", () => {
    expect(
      evaluateQuotaGate({ ready: true, loading: false, status: status({ available: 3 }) }),
    ).toBe("available");
  });

  it("is exhausted at a hard limit (available <= 0 and overage not allowed)", () => {
    expect(
      evaluateQuotaGate({
        ready: true,
        loading: false,
        status: status({ available: 0, allowOverage: false }),
      }),
    ).toBe("exhausted");
  });

  it("stays available at 0 remaining when overage IS allowed (billed, not blocked)", () => {
    expect(
      evaluateQuotaGate({
        ready: true,
        loading: false,
        status: status({ available: 0, allowOverage: true }),
      }),
    ).toBe("available");
  });
});

describe("quotaConsumedFraction", () => {
  it("returns 0 when included is 0 or missing (no division by zero)", () => {
    expect(quotaConsumedFraction({ consumed: 5, included: 0 })).toBe(0);
  });

  it("computes the consumed fraction", () => {
    expect(quotaConsumedFraction({ consumed: 2, included: 5 })).toBeCloseTo(0.4);
  });

  it("can exceed 1 under overage", () => {
    expect(quotaConsumedFraction({ consumed: 7, included: 5 })).toBeCloseTo(1.4);
  });
});

describe("quota metadata", () => {
  it("has explicit meta for the plan-limited create slugs", () => {
    expect(metaForSlug(USAGE_QUOTA_SLUGS.agents).label).toBe("Agents");
    expect(metaForSlug(USAGE_QUOTA_SLUGS.projects).label).toBe("Projects");
    expect(metaForSlug(USAGE_QUOTA_SLUGS.workspaces).label).toBe("Workspaces");
  });

  it("humanizes unknown slugs as a fallback", () => {
    expect(metaForSlug("api_calls").label).toBe("Api Calls");
  });
});
