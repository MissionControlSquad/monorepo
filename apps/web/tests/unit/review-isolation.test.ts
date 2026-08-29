import { describe, it, expect } from "vitest";
import { resolveReviewCheckoutRouting, ISOLATED_REVIEW_COMPOSE_PROFILE } from "@agentcenter/utils";

// Sandbox security hardening — Item 3. The trust-gated routing decision: an untrusted-source run routes
// its checkout/review through the isolated container profile; a trusted one stays on the normal path.
describe("untrusted-PR-review isolation routing (Item 3)", () => {
  it("routes an UNTRUSTED source to the isolated profile", () => {
    const r = resolveReviewCheckoutRouting({ trustLevel: "untrusted" });
    expect(r.isolated).toBe(true);
    expect(r.profile).toBe("isolated");
    expect(r.composeProfile).toBe(ISOLATED_REVIEW_COMPOSE_PROFILE);
    expect(r.reason).toMatch(/isolated container profile/i);
  });

  it("routes a low-trust / containment / requireUntrustedPrReview source to isolated", () => {
    expect(resolveReviewCheckoutRouting({ trustLevel: "low" }).isolated).toBe(true);
    expect(
      resolveReviewCheckoutRouting({ trustLevel: "standard", lowTrustContainment: true }).isolated,
    ).toBe(true);
    expect(
      resolveReviewCheckoutRouting({ trustLevel: "standard", requireUntrustedPrReview: true })
        .isolated,
    ).toBe(true);
  });

  it("keeps a STANDARD/TRUSTED source on the normal path (not isolated)", () => {
    const std = resolveReviewCheckoutRouting({ trustLevel: "standard" });
    expect(std.isolated).toBe(false);
    expect(std.profile).toBe("normal");
    expect(std.composeProfile).toBeNull();

    expect(resolveReviewCheckoutRouting({ trustLevel: "trusted" }).isolated).toBe(false);
    expect(resolveReviewCheckoutRouting(null).isolated).toBe(false);
  });
});
