import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementCounter,
  getMetrics,
  resetMetrics,
} from "../../src/server/services/notification-metrics";

// Gap-fill: the in-memory notification observability counters had no assertions (only incidental
// execution). Lock the increment/reset behavior and the defensive copy on read.

describe("notification-metrics", () => {
  beforeEach(() => resetMetrics());

  it("starts at zero after reset", () => {
    const m = getMetrics();
    expect(m.sent).toBe(0);
    expect(m.failed).toBe(0);
    expect(m.deduped).toBe(0);
  });

  it("increments by 1 by default and by n when given", () => {
    incrementCounter("sent");
    incrementCounter("sent", 2);
    incrementCounter("rateLimited", 5);
    expect(getMetrics().sent).toBe(3);
    expect(getMetrics().rateLimited).toBe(5);
  });

  it("returns an isolated copy — mutating the result does not change internal state", () => {
    incrementCounter("failed", 4);
    const snapshot = getMetrics();
    (snapshot as { failed: number }).failed = 999;
    expect(getMetrics().failed).toBe(4);
  });

  it("resetMetrics zeroes every counter", () => {
    incrementCounter("created", 3);
    incrementCounter("deadLettered", 1);
    resetMetrics();
    const m = getMetrics();
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });
});
