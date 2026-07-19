import { describe, it, expect } from "vitest";
import { caseIdentifier, completedAtForStatus } from "@/server/services/cases";

describe("caseIdentifier", () => {
  it("formats CASE-<n>", () => {
    expect(caseIdentifier(1)).toBe("CASE-1");
    expect(caseIdentifier(4207)).toBe("CASE-4207");
  });
});

describe("completedAtForStatus", () => {
  const existing = new Date("2026-03-01T00:00:00Z");
  it("done/cancelled set completedAt (preserving an existing one)", () => {
    expect(completedAtForStatus("done", existing)).toBe(existing);
    expect(completedAtForStatus("cancelled", existing)).toBe(existing);
    expect(completedAtForStatus("done", null)).toBeInstanceOf(Date);
  });
  it("any other status clears completedAt", () => {
    expect(completedAtForStatus("in_progress", existing)).toBeNull();
    expect(completedAtForStatus("in_review", existing)).toBeNull();
    expect(completedAtForStatus("draft", existing)).toBeNull();
    expect(completedAtForStatus("approved", existing)).toBeNull();
  });
});
