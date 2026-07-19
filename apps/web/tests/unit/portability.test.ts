import { describe, it, expect } from "vitest";
import { validateBundle, BUNDLE_VERSION } from "@/server/services/portability";

// Epic #14: pure bundle validation. No DB — exercises shape/version guards only.

const wellFormed = {
  version: BUNDLE_VERSION,
  exportedAt: "2026-07-07T00:00:00.000Z",
  agents: [{ name: "Ada", role: "engineer" }],
  projects: [{ name: "Apollo" }],
  skills: [{ key: "triage", name: "Triage", markdown: "# Triage" }],
};

describe("validateBundle", () => {
  it("accepts a well-formed v1 bundle and returns it", () => {
    const out = validateBundle(wellFormed);
    expect(out.version).toBe(1);
    expect(out.agents).toHaveLength(1);
  });

  it("accepts empty sections", () => {
    expect(() =>
      validateBundle({ version: 1, exportedAt: "x", agents: [], projects: [], skills: [] }),
    ).not.toThrow();
  });

  it("rejects a null/non-object bundle", () => {
    expect(() => validateBundle(null)).toThrow(/must be an object/);
    expect(() => validateBundle("nope")).toThrow(/must be an object/);
  });

  it("rejects a wrong/missing version", () => {
    expect(() => validateBundle({ ...wellFormed, version: 2 })).toThrow(
      /unsupported bundle version/,
    );
    expect(() => validateBundle({ ...wellFormed, version: undefined })).toThrow(
      /unsupported bundle version/,
    );
  });

  it("rejects non-array sections", () => {
    expect(() => validateBundle({ ...wellFormed, agents: {} })).toThrow(/agents must be an array/);
    expect(() => validateBundle({ ...wellFormed, projects: "x" })).toThrow(
      /projects must be an array/,
    );
    expect(() => validateBundle({ ...wellFormed, skills: null })).toThrow(
      /skills must be an array/,
    );
  });
});
