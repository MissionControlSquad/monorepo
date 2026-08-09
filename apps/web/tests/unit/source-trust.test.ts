import { describe, it, expect } from "vitest";
import {
  runRequiresReview,
  resolveRunReviewState,
  buildRunSourceTrust,
  buildPromotedSourceTrust,
  isQuarantined,
} from "@agentcenter/utils";

describe("source-trust / run review-state (Domain 8 G2)", () => {
  it("runRequiresReview is true for untrusted/low/containment/requireUntrustedPrReview, else false", () => {
    expect(runRequiresReview({ trustLevel: "untrusted" })).toBe(true);
    expect(runRequiresReview({ trustLevel: "low" })).toBe(true);
    expect(runRequiresReview({ trustLevel: "standard", lowTrustContainment: true })).toBe(true);
    expect(runRequiresReview({ trustLevel: "standard", requireUntrustedPrReview: true })).toBe(
      true,
    );
    expect(runRequiresReview({ trustLevel: "standard" })).toBe(false);
    expect(runRequiresReview({ trustLevel: "trusted" })).toBe(false);
    expect(runRequiresReview(null)).toBe(false);
  });

  it("resolveRunReviewState maps to needs_review vs approved", () => {
    expect(resolveRunReviewState({ trustLevel: "untrusted" })).toBe("needs_review");
    expect(resolveRunReviewState({ trustLevel: "trusted" })).toBe("approved");
    expect(resolveRunReviewState(null)).toBe("approved");
  });

  it("buildRunSourceTrust quarantines low-trust output and marks trusted output trusted", () => {
    const q = buildRunSourceTrust({ trustLevel: "untrusted" }, { agentId: "a1", runId: "r1" });
    expect(q).toMatchObject({
      preset: "low_trust_review",
      disposition: "quarantined",
      sourceAgentId: "a1",
      sourceRunId: "r1",
    });
    expect(isQuarantined(q)).toBe(true);

    const t = buildRunSourceTrust({ trustLevel: "standard" }, { agentId: "a2", runId: "r2" });
    expect(t).toMatchObject({ preset: "standard", disposition: "trusted" });
    expect(isQuarantined(t)).toBe(false);
  });

  it("buildPromotedSourceTrust flips disposition to trusted and records the reviewer", () => {
    const prev = buildRunSourceTrust({ trustLevel: "untrusted" }, { agentId: "a1", runId: "r1" });
    const promoted = buildPromotedSourceTrust(prev, "profile_board");
    expect(promoted).toMatchObject({
      preset: "low_trust_review",
      disposition: "trusted",
      sourceAgentId: "a1",
      sourceRunId: "r1",
      promotedByProfileId: "profile_board",
    });
    expect(isQuarantined(promoted)).toBe(false);
  });
});
