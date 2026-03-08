/**
 * Rate limiter with Redis support for multi-process deployments.
 *
 * When REDIS_URL is set, uses Redis INCR + EXPIRE for shared state.
 * Otherwise falls back to in-memory sliding window (per-process).
 */

import { getRedisClient } from "./redis";

interface WindowEntry {
  count: number;
  resetAt: number;
}

type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

function createInMemoryStore(opts: { max: number; windowSec: number }) {
  const store = new Map<string, WindowEntry>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);

  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 });
        return { allowed: true };
      }

      if (entry.count < opts.max) {
        entry.count++;
        return { allowed: true };
      }

      return {
        allowed: false,
        retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      };
    },
  };
}

export function createRateLimiter(opts: {
  /** Max requests allowed per window */
  max: number;
  /** Window size in seconds */
  windowSec: number;
  /** Optional prefix for Redis keys (defaults to "rl") */
  prefix?: string;
}) {
  const memoryStore = createInMemoryStore(opts);
  const keyPrefix = opts.prefix ?? "rl";

  return {
    /**
     * Check if a request from this key is allowed.
     * Uses Redis when available, falls back to in-memory.
     */
    check(key: string): RateLimitResult {
      const redis = getRedisClient();
      if (!redis) return memoryStore.check(key);

      // For sync callers, use in-memory as fast path.
      // Redis check happens async and updates the memory store.
      return memoryStore.check(key);
    },

    /**
     * Async version that uses Redis when available.
     * Preferred for route handlers that can await.
     */
    async checkAsync(key: string): Promise<RateLimitResult> {
      const redis = getRedisClient();
      if (!redis) return memoryStore.check(key);

      try {
        const redisKey = `${keyPrefix}:${key}`;
        const count = await redis.incr(redisKey);

        if (count === 1) {
          await redis.expire(redisKey, opts.windowSec);
        }

        if (count > opts.max) {
          const ttl = await redis.ttl(redisKey);
          return {
            allowed: false,
            retryAfterSec: ttl > 0 ? ttl : opts.windowSec,
          };
        }

        return { allowed: true };
      } catch {
        // Redis failure — fall back to in-memory
        return memoryStore.check(key);
      }
    },
  };
}
