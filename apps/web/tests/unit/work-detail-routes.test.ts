import { describe, it, expect } from "vitest";
import {
  sortStages,
  nextStageId,
  caseCountsByStage,
  caseStatusVariant,
  runStatusVariant,
  describeTrigger,
  selectWorkspaceById,
  formatTimestamp,
} from "@/lib/work-detail";

// Pure helpers behind the pipeline / routine / execution-workspace detail routes.

const stages = [
  { id: "s2", name: "Review", order: 1 },
  { id: "s0", name: "Intake", order: 0 },
  { id: "s3", name: "Done", order: 2 },
];

describe("sortStages", () => {
  it("orders by ascending order without mutating input", () => {
    const input = [...stages];
    const out = sortStages(input);
    expect(out.map((s) => s.id)).toEqual(["s0", "s2", "s3"]);
    expect(input.map((s) => s.id)).toEqual(["s2", "s0", "s3"]);
  });
});

describe("nextStageId", () => {
  it("returns the following stage in order", () => {
    expect(nextStageId(stages, "s0")).toBe("s2");
    expect(nextStageId(stages, "s2")).toBe("s3");
  });
  it("returns null at the last stage or for an unknown/no current stage", () => {
    expect(nextStageId(stages, "s3")).toBeNull();
    expect(nextStageId(stages, null)).toBeNull();
    expect(nextStageId(stages, "nope")).toBeNull();
  });
});

describe("caseCountsByStage", () => {
  it("counts only active cases per stage and zero-fills every stage", () => {
    const counts = caseCountsByStage(stages, [
      { status: "open", currentStageId: "s0" },
      { status: "claimed", currentStageId: "s0" },
      { status: "done", currentStageId: "s0" }, // excluded
      { status: "rejected", currentStageId: "s2" }, // excluded
      { status: "in_review", currentStageId: "s2" },
      { status: "open", currentStageId: null }, // no stage
    ]);
    expect(counts).toEqual({ s0: 2, s2: 1, s3: 0 });
  });
});

describe("status variants", () => {
  it("maps case statuses", () => {
    expect(caseStatusVariant("rejected")).toBe("red");
    expect(caseStatusVariant("done")).toBe("green");
    expect(caseStatusVariant("in_review")).toBe("yellow");
    expect(caseStatusVariant("claimed")).toBe("blue");
    expect(caseStatusVariant("open")).toBe("gray");
  });
  it("maps run statuses", () => {
    expect(runStatusVariant("failed")).toBe("red");
    expect(runStatusVariant("cancelled")).toBe("red");
    expect(runStatusVariant("succeeded")).toBe("green");
    expect(runStatusVariant("running")).toBe("blue");
    expect(runStatusVariant("queued")).toBe("gray");
  });
});

describe("describeTrigger", () => {
  it("summarizes cron triggers with tz", () => {
    expect(
      describeTrigger({ type: "cron", cronExpression: "0 9 * * 1", timezone: "America/New_York" }),
    ).toBe("cron 0 9 * * 1 (America/New_York)");
    expect(describeTrigger({ type: "cron", cronExpression: "0 9 * * 1" })).toBe("cron 0 9 * * 1");
    expect(describeTrigger({ type: "cron", cronExpression: null })).toBe("cron (no schedule)");
  });
  it("summarizes webhook and manual triggers", () => {
    expect(describeTrigger({ type: "webhook", publicId: "abc123" })).toBe(
      "webhook /api/routines/fire/abc123",
    );
    expect(describeTrigger({ type: "webhook", publicId: null })).toBe("webhook (no url)");
    expect(describeTrigger({ type: "manual" })).toBe("manual");
  });
});

describe("selectWorkspaceById", () => {
  const list = [{ id: "w1" }, { id: "w2" }];
  it("finds a workspace by id or returns null", () => {
    expect(selectWorkspaceById(list, "w2")).toEqual({ id: "w2" });
    expect(selectWorkspaceById(list, "missing")).toBeNull();
    expect(selectWorkspaceById(undefined, "w1")).toBeNull();
    expect(selectWorkspaceById(null, "w1")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("compacts an ISO timestamp and handles empties", () => {
    expect(formatTimestamp("2026-07-19T12:34:56.000Z")).toBe("2026-07-19 12:34:56");
    expect(formatTimestamp(null)).toBe("");
    expect(formatTimestamp(undefined)).toBe("");
  });
});
