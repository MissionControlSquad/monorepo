import { describe, it, expect } from "vitest";
import { evaluateTrust, type TrustProfileEval } from "@/server/services/trust";

const base: TrustProfileEval = {
  trustLevel: "standard",
  lowTrustContainment: false,
  requireUntrustedPrReview: false,
  changeConsentRequired: false,
  executionAllowlist: [],
};

describe("evaluateTrust", () => {
  it("allows everything when there is no trust profile (default)", () => {
    expect(evaluateTrust(null, "deploy", "command").allowed).toBe(true);
  });

  it("change-consent blocks a non-allowlisted action, allows an allowlisted one", () => {
    const p: TrustProfileEval = {
      ...base,
      changeConsentRequired: true,
      executionAllowlist: ["read"],
    };
    expect(evaluateTrust(p, "deploy", "command").allowed).toBe(false);
    expect(evaluateTrust(p, "read", "command").allowed).toBe(true);
  });

  it("low-trust containment blocks host_write only", () => {
    const p: TrustProfileEval = { ...base, lowTrustContainment: true };
    expect(evaluateTrust(p, "write", "host_write").allowed).toBe(false);
    expect(evaluateTrust(p, "write", "command").allowed).toBe(true);
  });

  it("untrusted PR merge requires review; trusted merges freely", () => {
    const untrusted: TrustProfileEval = {
      ...base,
      requireUntrustedPrReview: true,
      trustLevel: "untrusted",
    };
    expect(evaluateTrust(untrusted, "merge", "pr_merge").allowed).toBe(false);
    expect(
      evaluateTrust({ ...untrusted, trustLevel: "trusted" }, "merge", "pr_merge").allowed,
    ).toBe(true);
  });
});
