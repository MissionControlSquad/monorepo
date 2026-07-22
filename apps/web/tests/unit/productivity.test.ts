import { describe, it, expect } from "vitest";
import { assessProductivity } from "@agentcenter/utils";

const HOUR = 3_600_000;

describe("assessProductivity (#132)", () => {
  it("productive: recent completions, low idle", () => {
    const r = assessProductivity({ idleMs: 5 * 60_000, runsCompleted: 4, runsFailed: 0 });
    expect(r.verdict).toBe("productive");
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("stuck: idle beyond the threshold", () => {
    const r = assessProductivity({ idleMs: 5 * HOUR, runsCompleted: 0, runsFailed: 0 });
    expect(r.verdict).toBe("stuck");
    expect(r.reasons.join(" ")).toMatch(/idle/);
  });

  it("stuck: a single task dragging far too long", () => {
    const r = assessProductivity({
      idleMs: 10 * 60_000,
      runsCompleted: 1,
      runsFailed: 0,
      currentTaskAgeMs: 30 * HOUR,
    });
    expect(r.verdict).toBe("stuck");
  });

  it("struggling: failures dominate completions", () => {
    const r = assessProductivity({ idleMs: 60_000, runsCompleted: 1, runsFailed: 4 });
    expect(r.verdict).toBe("struggling");
    expect(r.score).toBeLessThan(0.7);
  });

  it("idle: quiet with no completions but not yet stuck", () => {
    const r = assessProductivity({ idleMs: 2.5 * HOUR, runsCompleted: 0, runsFailed: 0 });
    expect(r.verdict).toBe("idle");
  });

  it("surfaces open blockers in the reasons", () => {
    const r = assessProductivity({
      idleMs: 60_000,
      runsCompleted: 2,
      runsFailed: 0,
      openBlockers: 3,
    });
    expect(r.reasons.join(" ")).toMatch(/3 blocked/);
  });
});
