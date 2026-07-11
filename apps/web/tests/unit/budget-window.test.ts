import { describe, it, expect } from "vitest";
import { windowBounds } from "@/server/services/budget-window";
import { isBreached } from "@/server/services/budget-enforcement";

describe("windowBounds", () => {
  // 2026-03-11T14:37:05Z — a Wednesday, mid-month, mid-hour.
  const now = new Date("2026-03-11T14:37:05.123Z");

  it("hourly = top of hour → next hour (UTC)", () => {
    const { windowStart, windowEnd } = windowBounds("hourly", now);
    expect(windowStart.toISOString()).toBe("2026-03-11T14:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2026-03-11T15:00:00.000Z");
  });

  it("daily = UTC midnight → next midnight", () => {
    const { windowStart, windowEnd } = windowBounds("daily", now);
    expect(windowStart.toISOString()).toBe("2026-03-11T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });

  it("weekly = Monday 00:00 UTC → next Monday (ISO week)", () => {
    // 2026-03-11 is a Wednesday → week starts Monday 2026-03-09.
    const { windowStart, windowEnd } = windowBounds("weekly", now);
    expect(windowStart.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });

  it("weekly anchors correctly when the instant is a Sunday", () => {
    const sunday = new Date("2026-03-15T09:00:00.000Z"); // Sunday
    const { windowStart, windowEnd } = windowBounds("weekly", sunday);
    expect(windowStart.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });

  it("monthly = first of month → first of next month", () => {
    const { windowStart, windowEnd } = windowBounds("monthly", now);
    expect(windowStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("monthly rolls the year at December", () => {
    const dec = new Date("2026-12-20T00:00:00.000Z");
    const { windowStart, windowEnd } = windowBounds("monthly", dec);
    expect(windowStart.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(windowEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("isBreached", () => {
  it("is true at exactly the limit (reaching the limit counts)", () => {
    expect(isBreached(1000, 1000)).toBe(true);
  });
  it("is true above the limit", () => {
    expect(isBreached(1001, 1000)).toBe(true);
  });
  it("is false below the limit", () => {
    expect(isBreached(999, 1000)).toBe(false);
  });
});
