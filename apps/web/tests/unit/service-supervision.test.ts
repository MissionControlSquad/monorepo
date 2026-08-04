import { describe, it, expect } from "vitest";
import { shouldRestartService, shouldEvictIdle } from "@agentcenter/utils";

describe("shouldRestartService (#95)", () => {
  it("allows a restart within budget", () => {
    const now = 100_000;
    const d = shouldRestartService([now - 5000, now - 3000], now, {
      maxRestarts: 5,
      windowMs: 60_000,
    });
    expect(d.allow).toBe(true);
    expect(d.recentRestarts).toBe(2);
  });

  it("suppresses a restart storm", () => {
    const now = 100_000;
    const history = [1, 2, 3, 4, 5].map((i) => now - i * 1000);
    const d = shouldRestartService(history, now, { maxRestarts: 5, windowMs: 60_000 });
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/storm/);
  });

  it("restarts outside the window don't count toward the storm", () => {
    const now = 100_000;
    const history = [1, 2, 3, 4, 5].map((i) => now - 120_000 - i * 1000); // all > 60s ago
    expect(shouldRestartService(history, now, { maxRestarts: 5, windowMs: 60_000 }).allow).toBe(
      true,
    );
  });
});

describe("shouldEvictIdle (#95)", () => {
  it("evicts once idle past the threshold", () => {
    const now = 100_000;
    expect(shouldEvictIdle(new Date(now - 61_000), now, 60_000)).toBe(true);
    expect(shouldEvictIdle(new Date(now - 30_000), now, 60_000)).toBe(false);
    expect(shouldEvictIdle(null, now, 60_000)).toBe(false);
  });
});
