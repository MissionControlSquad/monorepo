import { describe, it, expect } from "vitest";
import { isValidTransition } from "@/server/services/pipelines";
import { generatePublicId } from "@/server/services/routines";

describe("isValidTransition (pipeline stage order)", () => {
  it("allows moving to a strictly higher-order stage", () => {
    expect(isValidTransition(0, 1)).toBe(true);
    expect(isValidTransition(1, 5)).toBe(true);
  });
  it("rejects moving to an equal or lower-order stage", () => {
    expect(isValidTransition(1, 1)).toBe(false);
    expect(isValidTransition(2, 1)).toBe(false);
  });
  it("allows the first transition from an unplaced case (fromOrder -1)", () => {
    expect(isValidTransition(-1, 0)).toBe(true);
  });
});

describe("generatePublicId (webhook fire url)", () => {
  it("is url-safe and 32 hex chars", () => {
    const id = generatePublicId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePublicId()));
    expect(ids.size).toBe(100);
  });
});
