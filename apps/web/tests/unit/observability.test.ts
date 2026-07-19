import { describe, it, expect } from "vitest";
import {
  bucketAgentCounts,
  bucketTaskCounts,
  getUtcMonthStart,
} from "@/server/services/observability";

// Epic #13: pure summary bucketers. No DB.
const c = (status: string, n: number) => ({ status, _count: { _all: n } });

describe("bucketAgentCounts", () => {
  it("folds idle+active into operational and keeps blocked separate", () => {
    const s = bucketAgentCounts([c("idle", 3), c("active", 2), c("blocked", 4)]);
    expect(s).toEqual({ total: 9, operational: 5, blocked: 4, idle: 3, active: 2 });
  });
  it("counts unknown statuses toward total only", () => {
    const s = bucketAgentCounts([c("idle", 1), c("mystery", 5)]);
    expect(s.total).toBe(6);
    expect(s.operational).toBe(1);
    expect(s.blocked).toBe(0);
  });
  it("handles an empty set", () => {
    expect(bucketAgentCounts([])).toEqual({
      total: 0,
      operational: 0,
      blocked: 0,
      idle: 0,
      active: 0,
    });
  });
});

describe("bucketTaskCounts", () => {
  it("treats open as every non-done task (superset of the splits)", () => {
    const s = bucketTaskCounts([
      c("inbox", 2),
      c("assigned", 1),
      c("in_progress", 3),
      c("review", 1),
      c("blocked", 2),
      c("done", 4),
    ]);
    expect(s.total).toBe(13);
    expect(s.done).toBe(4);
    expect(s.open).toBe(9); // total - done
    expect(s.inProgress).toBe(3);
    expect(s.review).toBe(1);
    expect(s.blocked).toBe(2);
  });
  it("done-only has zero open", () => {
    const s = bucketTaskCounts([c("done", 5)]);
    expect(s).toEqual({ total: 5, open: 0, inProgress: 0, review: 0, blocked: 0, done: 5 });
  });
});

describe("getUtcMonthStart", () => {
  it("returns the first instant of the UTC month", () => {
    expect(getUtcMonthStart(new Date("2026-07-07T13:45:00.000Z")).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });
  it("uses the UTC month even near a local-time boundary", () => {
    // 2026-08-01T00:30 in UTC is still August; a late-July local time must not matter.
    expect(getUtcMonthStart(new Date("2026-08-01T00:30:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });
});
