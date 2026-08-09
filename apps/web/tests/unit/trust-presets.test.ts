import { describe, it, expect } from "vitest";
import { trustPresetForLevel, isTrustLevel, TRUST_LEVELS } from "@agentcenter/utils";

describe("trust presets (parity #169)", () => {
  it("exposes the four trust levels", () => {
    expect(TRUST_LEVELS).toEqual(["untrusted", "low", "standard", "trusted"]);
  });

  it("isTrustLevel guards valid values", () => {
    expect(isTrustLevel("trusted")).toBe(true);
    expect(isTrustLevel("nonsense")).toBe(false);
    expect(isTrustLevel(null)).toBe(false);
  });

  it("untrusted is fully contained + gated", () => {
    expect(trustPresetForLevel("untrusted")).toEqual({
      lowTrustContainment: true,
      requireUntrustedPrReview: true,
      autoPromoteWorkProduct: false,
      changeConsentRequired: true,
    });
  });

  it("trusted runs freely (no containment/gating)", () => {
    expect(trustPresetForLevel("trusted")).toEqual({
      lowTrustContainment: false,
      requireUntrustedPrReview: false,
      autoPromoteWorkProduct: true,
      changeConsentRequired: false,
    });
  });

  it("containment relaxes monotonically as trust increases", () => {
    const contained = TRUST_LEVELS.map((l) => trustPresetForLevel(l).lowTrustContainment);
    // true, true, false, false — never re-tightens
    expect(contained).toEqual([true, true, false, false]);
  });

  it("falls back to standard for an unknown level", () => {
    expect(trustPresetForLevel("bogus")).toEqual(trustPresetForLevel("standard"));
  });
});
