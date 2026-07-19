import { describe, it, expect } from "vitest";
import {
  isWorkProductKind,
  isWorkProductReviewState,
  isWorkProductStatus,
  canTransitionWorkProductStatus,
  initialWorkProductGate,
} from "@agentcenter/utils";

describe("work-product taxonomy (Domain 8 G1)", () => {
  it("recognizes output kinds vs authored content", () => {
    for (const k of ["pull_request", "branch", "commit", "preview_url", "runtime_service"]) {
      expect(isWorkProductKind(k)).toBe(true);
    }
    for (const k of ["markdown", "code", "file", "link"]) {
      expect(isWorkProductKind(k)).toBe(false);
    }
  });

  it("validates review states and statuses", () => {
    expect(isWorkProductReviewState("needs_review")).toBe(true);
    expect(isWorkProductReviewState("bogus")).toBe(false);
    expect(isWorkProductStatus("merged")).toBe(true);
    expect(isWorkProductStatus("nope")).toBe(false);
  });

  it("initialWorkProductGate quarantines low-trust output", () => {
    expect(initialWorkProductGate(true)).toEqual({
      reviewState: "needs_review",
      outputStatus: "ready_for_review",
    });
    expect(initialWorkProductGate(false)).toEqual({ reviewState: "none", outputStatus: "active" });
  });

  it("enforces legal status transitions", () => {
    expect(canTransitionWorkProductStatus(null, "active")).toBe(true); // first assignment
    expect(canTransitionWorkProductStatus("active", "active")).toBe(true); // idempotent
    expect(canTransitionWorkProductStatus("ready_for_review", "approved")).toBe(true);
    expect(canTransitionWorkProductStatus("approved", "merged")).toBe(true);
    expect(canTransitionWorkProductStatus("merged", "active")).toBe(false); // terminal-ish
    expect(canTransitionWorkProductStatus("active", "merged")).toBe(false); // must be approved first
    expect(canTransitionWorkProductStatus("active", "bogus")).toBe(false);
  });
});
