import { describe, it, expect } from "vitest";
import { fingerprintProviderConfig, classifyConfigChange } from "@agentcenter/utils";

// Tier D / Phase 3 (Plan 5): pure custom-image config fingerprint + change classification.
describe("fingerprintProviderConfig", () => {
  it("is stable regardless of key order and ignores non-structural fields", () => {
    const a = fingerprintProviderConfig({ provider: "e2b", image: "base", region: "us" });
    const b = fingerprintProviderConfig({ image: "base", provider: "e2b", region: "eu" });
    expect(a).toBe(b); // region is non-structural → same structural fingerprint
  });

  it("changes when a structural field changes", () => {
    expect(fingerprintProviderConfig({ provider: "e2b", image: "base" })).not.toBe(
      fingerprintProviderConfig({ provider: "e2b", image: "other" }),
    );
  });
});

describe("classifyConfigChange", () => {
  it("none when identical", () => {
    const cfg = { provider: "e2b", image: "base", region: "us" };
    expect(classifyConfigChange(cfg, { ...cfg })).toBe("none");
  });

  it("relinkable when only a non-structural field changed", () => {
    expect(
      classifyConfigChange(
        { provider: "e2b", image: "base", region: "us" },
        { provider: "e2b", image: "base", region: "eu" },
      ),
    ).toBe("relinkable");
  });

  it("breaking when a structural field (provider/image) changed", () => {
    expect(
      classifyConfigChange(
        { provider: "e2b", image: "base" },
        { provider: "daytona", image: "base" },
      ),
    ).toBe("breaking");
    expect(
      classifyConfigChange({ provider: "e2b", image: "base" }, { provider: "e2b", image: "v2" }),
    ).toBe("breaking");
  });
});
