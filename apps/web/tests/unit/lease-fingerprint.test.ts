import { describe, it, expect } from "vitest";
import { fingerprintSecretVersions } from "@agentcenter/utils";

// Sandbox security hardening — Item 1. The lease secret-version fingerprint is a PURE hash over the
// {secretId, version} pairs a run depends on. A rotated secret bumps its version → the fingerprint
// changes → a reusable lease keyed on the old fingerprint is no longer re-attached.
describe("lease secret-version fingerprint (Item 1)", () => {
  it("is order-independent and deterministic", () => {
    const a = fingerprintSecretVersions([
      { key: "sec_a", version: 1 },
      { key: "sec_b", version: 3 },
    ]);
    const b = fingerprintSecretVersions([
      { key: "sec_b", version: 3 },
      { key: "sec_a", version: 1 },
    ]);
    expect(a).toBe(b);
    // stable across calls
    expect(fingerprintSecretVersions([{ key: "sec_a", version: 1 }])).toBe(
      fingerprintSecretVersions([{ key: "sec_a", version: 1 }]),
    );
  });

  it("CHANGES when any depended-on secret version bumps (a rotation)", () => {
    const before = fingerprintSecretVersions([
      { key: "sec_a", version: 1 },
      { key: "sec_b", version: 1 },
    ]);
    const afterRotation = fingerprintSecretVersions([
      { key: "sec_a", version: 2 }, // rotated
      { key: "sec_b", version: 1 },
    ]);
    expect(afterRotation).not.toBe(before);
  });

  it("changes when the set of secrets changes (added/removed dependency)", () => {
    const one = fingerprintSecretVersions([{ key: "sec_a", version: 1 }]);
    const two = fingerprintSecretVersions([
      { key: "sec_a", version: 1 },
      { key: "sec_b", version: 1 },
    ]);
    expect(one).not.toBe(two);
  });

  it("empty set yields a stable sentinel (matchable, not empty-string)", () => {
    expect(fingerprintSecretVersions([])).toBe("sf1:none");
    expect(fingerprintSecretVersions([{ key: "", version: 9 }])).toBe("sf1:none"); // blank keys ignored
  });

  it("de-dupes a repeated key (last version wins)", () => {
    const dup = fingerprintSecretVersions([
      { key: "sec_a", version: 1 },
      { key: "sec_a", version: 2 },
    ]);
    const single = fingerprintSecretVersions([{ key: "sec_a", version: 2 }]);
    expect(dup).toBe(single);
  });
});
