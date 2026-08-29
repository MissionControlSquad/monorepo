import { describe, it, expect } from "vitest";
import { resolveLoginMode } from "../../src/components/auth/login-mode";

describe("resolveLoginMode (login-page gating)", () => {
  it("buildbase is primary when an org id is configured", () => {
    expect(resolveLoginMode("69e6895aa53f542558f527a9")).toBe("buildbase");
  });

  it("admin-only when buildbase is not configured", () => {
    expect(resolveLoginMode("")).toBe("operator-only");
    expect(resolveLoginMode("   ")).toBe("operator-only");
    expect(resolveLoginMode(undefined)).toBe("operator-only");
    expect(resolveLoginMode(null)).toBe("operator-only");
  });
});
