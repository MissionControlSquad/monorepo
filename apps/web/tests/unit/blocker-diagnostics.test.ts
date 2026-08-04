import { describe, it, expect } from "vitest";
import { computeBlockerDiagnostics, isBlockerResolved } from "@agentcenter/utils";

describe("computeBlockerDiagnostics (Domain 8 G6.1)", () => {
  it("a task with no blockers is ready", () => {
    const d = computeBlockerDiagnostics([]);
    expect(d.readiness).toBe("ready");
    expect(d.unresolvedCount).toBe(0);
    expect(d.reasons[0]).toMatch(/No blockers/);
  });

  it("all blockers done → ready", () => {
    const d = computeBlockerDiagnostics([
      { taskId: "a", status: "done", source: "blocked_by" },
      { taskId: "b", status: "done", source: "relation" },
    ]);
    expect(d.readiness).toBe("ready");
    expect(d.blockers.every((b) => b.resolved)).toBe(true);
    expect(d.reasons[0]).toMatch(/All blockers are done/);
  });

  it("an unresolved blocker → blocked, with a reason per unresolved blocker", () => {
    const d = computeBlockerDiagnostics([
      { taskId: "a", status: "done", source: "blocked_by" },
      { taskId: "b", status: "in_progress", source: "relation" },
      { taskId: "c", status: "blocked", source: "relation" },
    ]);
    expect(d.readiness).toBe("blocked");
    expect(d.unresolvedCount).toBe(2);
    expect(d.reasons.some((r) => r.includes("2 of 3"))).toBe(true);
    expect(d.reasons.some((r) => r.includes("Blocked by b"))).toBe(true);
    expect(d.reasons.some((r) => r.includes("Blocked by c"))).toBe(true);
  });

  it("dedupes a blocker seen via both edges, preferring the blocked_by label", () => {
    const d = computeBlockerDiagnostics([
      { taskId: "a", status: "in_progress", source: "relation" },
      { taskId: "a", status: "in_progress", source: "blocked_by" },
    ]);
    expect(d.blockers).toHaveLength(1);
    expect(d.blockers[0].source).toBe("blocked_by");
  });

  it("isBlockerResolved treats only done as resolved", () => {
    expect(isBlockerResolved("done")).toBe(true);
    expect(isBlockerResolved("in_progress")).toBe(false);
    expect(isBlockerResolved("blocked")).toBe(false);
  });
});
