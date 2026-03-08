import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "../../src/server/rate-limit";

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests under the limit", () => {
    const limiter = createRateLimiter({ max: 3, windowSec: 60 });
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = createRateLimiter({ max: 2, windowSec: 60 });
    limiter.check("ip1");
    limiter.check("ip1");
    const result = limiter.check("ip1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSec).toBeGreaterThan(0);
      expect(result.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("tracks different keys independently", () => {
    const limiter = createRateLimiter({ max: 1, windowSec: 60 });
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip2").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);
    expect(limiter.check("ip2").allowed).toBe(false);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ max: 1, windowSec: 10 });

    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(11_000);

    expect(limiter.check("ip1").allowed).toBe(true);
    vi.useRealTimers();
  });
});
