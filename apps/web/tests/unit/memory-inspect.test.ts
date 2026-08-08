import { describe, it, expect } from "vitest";
import {
  formatProvenance,
  formatMemoryCost,
  formatLatency,
  opTypeBadgeVariant,
  sourceKindLabel,
  attributionLabel,
  shortId,
} from "@/lib/memory-format";

// Domain 4 GAP-D: the Memory inspect UI's pure formatting helpers.

describe("shortId", () => {
  it("returns short ids verbatim", () => {
    expect(shortId("abc123")).toBe("abc123");
  });
  it("truncates long ids to the last 8 chars", () => {
    expect(shortId("clv0abcdef1234567890")).toBe("…34567890");
  });
  it("handles null/undefined", () => {
    expect(shortId(null)).toBe("");
    expect(shortId(undefined)).toBe("");
  });
});

describe("sourceKindLabel", () => {
  it("maps known kinds", () => {
    expect(sourceKindLabel("run")).toBe("Run");
    expect(sourceKindLabel("issue_comment")).toBe("Comment");
    expect(sourceKindLabel("manual_note")).toBe("Manual note");
  });
  it("passes through unknown kinds and defaults null", () => {
    expect(sourceKindLabel("weird_kind")).toBe("weird_kind");
    expect(sourceKindLabel(null)).toBe("Unknown");
  });
});

describe("formatProvenance", () => {
  it("describes a run-sourced entry with its task ref", () => {
    expect(
      formatProvenance({ sourceKind: "run", sourceTaskId: "task_1234567890", sourceRefId: null }),
    ).toBe("Run · task …34567890");
  });
  it("falls back to sourceRefId when there is no task", () => {
    expect(
      formatProvenance({ sourceKind: "issue_comment", sourceTaskId: null, sourceRefId: "cmt_abcdefgh" }),
    ).toBe("Comment · ref …abcdefgh");
  });
  it("reports absence of provenance", () => {
    expect(formatProvenance({ sourceKind: null, sourceTaskId: null, sourceRefId: null })).toBe(
      "No provenance",
    );
  });
  it("shows just the kind when no reference is present", () => {
    expect(formatProvenance({ sourceKind: "run" })).toBe("Run");
  });
});

describe("formatMemoryCost", () => {
  it("renders '-' for no cost", () => {
    expect(formatMemoryCost(null)).toBe("-");
    expect(formatMemoryCost(undefined)).toBe("-");
  });
  it("renders zero as $0.00", () => {
    expect(formatMemoryCost(0)).toBe("$0.00");
  });
  it("renders whole-cent amounts to 2 decimals", () => {
    expect(formatMemoryCost(150)).toBe("$1.50");
  });
  it("keeps sub-cent amounts legible", () => {
    // 0.3 cents => $0.003
    expect(formatMemoryCost(0.3)).toBe("$0.003");
  });
});

describe("formatLatency", () => {
  it("renders '-' for null", () => {
    expect(formatLatency(null)).toBe("-");
  });
  it("renders sub-second as ms", () => {
    expect(formatLatency(123)).toBe("123 ms");
  });
  it("renders >= 1s as seconds", () => {
    expect(formatLatency(1400)).toBe("1.4 s");
  });
});

describe("opTypeBadgeVariant", () => {
  it("colors writes green, reads blue, deletes red", () => {
    expect(opTypeBadgeVariant("capture")).toBe("green");
    expect(opTypeBadgeVariant("record_upsert")).toBe("green");
    expect(opTypeBadgeVariant("query")).toBe("blue");
    expect(opTypeBadgeVariant("get")).toBe("blue");
    expect(opTypeBadgeVariant("forget")).toBe("red");
    expect(opTypeBadgeVariant("correct")).toBe("orange");
    expect(opTypeBadgeVariant("mystery")).toBe("gray");
  });
});

describe("attributionLabel", () => {
  it("maps known modes and defaults", () => {
    expect(attributionLabel("billed_directly")).toBe("Billed directly");
    expect(attributionLabel("included_in_run")).toBe("Included in run");
    expect(attributionLabel(null)).toBe("Untracked");
    expect(attributionLabel("custom")).toBe("custom");
  });
});
