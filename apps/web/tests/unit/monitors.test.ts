import { describe, it, expect } from "vitest";
import { isBreached, isMonitorMetric, isMonitorComparator } from "@agentcenter/utils";

describe("monitor helpers (Tier C)", () => {
  it("isBreached evaluates each comparator", () => {
    expect(isBreached(5, "gt", 3)).toBe(true);
    expect(isBreached(3, "gt", 3)).toBe(false);
    expect(isBreached(3, "gte", 3)).toBe(true);
    expect(isBreached(2, "lt", 3)).toBe(true);
    expect(isBreached(3, "lte", 3)).toBe(true);
    expect(isBreached(4, "lte", 3)).toBe(false);
  });
  it("validates metric + comparator vocab", () => {
    expect(isMonitorMetric("active_agents")).toBe(true);
    expect(isMonitorMetric("nope")).toBe(false);
    expect(isMonitorComparator("gte")).toBe(true);
    expect(isMonitorComparator("eq")).toBe(false);
  });
});
