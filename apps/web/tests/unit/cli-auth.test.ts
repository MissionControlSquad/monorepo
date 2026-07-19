import { describe, it, expect } from "vitest";
import { normalizeUserCode, formatUserCode, isValidUserCode } from "@agentcenter/utils";

describe("cli-auth user code helpers", () => {
  it("normalizes to uppercase alphanumerics", () => {
    expect(normalizeUserCode("abcd-2345")).toBe("ABCD2345");
    expect(normalizeUserCode("  a b/c.d ")).toBe("ABCD");
  });

  it("formats a normalized code grouped as XXXX-XXXX", () => {
    expect(formatUserCode("abcd2345")).toBe("ABCD-2345");
    expect(formatUserCode("abc")).toBe("ABC");
  });

  it("validates length + alphabet (rejects ambiguous chars)", () => {
    expect(isValidUserCode("ABCD-2345")).toBe(true);
    expect(isValidUserCode("ABCD234")).toBe(false); // too short
    expect(isValidUserCode("ABCD0111")).toBe(false); // 0/1 not in alphabet
  });
});
