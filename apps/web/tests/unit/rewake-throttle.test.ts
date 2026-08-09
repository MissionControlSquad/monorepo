import { describe, it, expect } from "vitest";
import { shouldRewake, advanceRewakeState } from "@agentcenter/utils";

describe("shouldRewake (#88)", () => {
  it("always allows the first wake", () => {
    expect(shouldRewake({ lastWakeAt: null, consecutiveWakes: 0 }, 1000).allow).toBe(true);
  });

  it("throttles within the base cooldown", () => {
    const now = 100_000;
    const d = shouldRewake({ lastWakeAt: now - 10_000, consecutiveWakes: 1 }, now, {
      baseIntervalMs: 60_000,
    });
    expect(d.allow).toBe(false);
    expect(d.waitMs).toBe(50_000);
  });

  it("allows once the cooldown elapses", () => {
    const now = 100_000;
    expect(
      shouldRewake({ lastWakeAt: now - 61_000, consecutiveWakes: 1 }, now, {
        baseIntervalMs: 60_000,
      }).allow,
    ).toBe(true);
  });

  it("backs off exponentially with consecutive wakes (capped)", () => {
    const now = 1_000_000;
    // 3 consecutive wakes → base * 2^2 = 240s cooldown
    const d = shouldRewake({ lastWakeAt: now - 100_000, consecutiveWakes: 3 }, now, {
      baseIntervalMs: 60_000,
      maxIntervalMs: 60 * 60_000,
    });
    expect(d.allow).toBe(false);
    expect(d.waitMs).toBe(240_000 - 100_000);
  });
});

describe("advanceRewakeState", () => {
  it("resets the counter on progress, increments otherwise", () => {
    expect(advanceRewakeState({ lastWakeAt: 0, consecutiveWakes: 3 }, 5000, true)).toEqual({
      lastWakeAt: 5000,
      consecutiveWakes: 0,
    });
    expect(advanceRewakeState({ lastWakeAt: 0, consecutiveWakes: 3 }, 5000, false)).toEqual({
      lastWakeAt: 5000,
      consecutiveWakes: 4,
    });
  });
});
