import { describe, it, expect } from "vitest";
import { redactQuarantinedText, QUARANTINE_REDACTION } from "@agentcenter/utils";
import type { SourceTrust } from "@agentcenter/utils";

const quarantined: SourceTrust = { preset: "low_trust_review", disposition: "quarantined" };
const trusted: SourceTrust = { preset: "standard", disposition: "trusted" };

describe("redactQuarantinedText (Domain 8 G2 containment)", () => {
  it("redacts quarantined output until approved", () => {
    expect(redactQuarantinedText(quarantined, "needs_review", "secret output")).toBe(
      QUARANTINE_REDACTION,
    );
    expect(redactQuarantinedText(quarantined, null, "secret output")).toBe(QUARANTINE_REDACTION);
  });

  it("reveals once the review promotes it to approved", () => {
    expect(redactQuarantinedText(quarantined, "approved", "secret output")).toBe("secret output");
  });

  it("never redacts trusted output", () => {
    expect(redactQuarantinedText(trusted, "needs_review", "hi")).toBe("hi");
    expect(redactQuarantinedText(null, null, "hi")).toBe("hi");
  });

  it("passes null/undefined through untouched", () => {
    expect(redactQuarantinedText(quarantined, "needs_review", null)).toBeNull();
    expect(redactQuarantinedText(quarantined, "needs_review", undefined)).toBeUndefined();
  });
});
