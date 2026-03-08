/**
 * Redis-backed response cache with in-memory fallback.
 *
 * When REDIS_URL is set, caches serializable values in Redis (shared
 * across processes). Falls back to the existing TTLCache for local dev.
 *
 * Usage:
 *   const cache = new HybridCache<MyType>("analytics", 300);
 *   const data = await cache.getOrSet("key", async () => expensiveQuery());
 */

import { getRedisClient } from "./redis";
import { TTLCache } from "./cache";

export class HybridCache<T> {
  private memory: TTLCache<T>;
  private prefix: string;
  private ttlSec: number;

  constructor(prefix: string, ttlSeconds: number) {
    this.memory = new TTLCache<T>(ttlSeconds);
    this.prefix = prefix;
    this.ttlSec = ttlSeconds;
  }

  private redisKey(key: string): string {
    return `cache:${this.prefix}:${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    // Check in-memory first (fastest)
    const memResult = this.memory.get(key);
    if (memResult !== undefined) return memResult;

    // Try Redis
    const redis = getRedisClient();
    if (!redis) return undefined;

    try {
      const raw = await redis.get(this.redisKey(key));
      if (raw === null) return undefined;

      const value = JSON.parse(raw) as T;
      // Populate in-memory cache for subsequent reads
      this.memory.set(key, value);
      return value;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    this.memory.set(key, value);

    const redis = getRedisClient();
    if (!redis) return;

    try {
      await redis.setex(this.redisKey(key), this.ttlSec, JSON.stringify(value));
    } catch {
      // Redis write failure is non-fatal — in-memory cache still works
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);

    const redis = getRedisClient();
    if (!redis) return;

    try {
      await redis.del(this.redisKey(key));
    } catch {
      // Non-fatal
    }
  }

  /**
   * Get a cached value or compute and cache it.
   * This is the primary API for most use cases.
   */
  async getOrSet(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== undefined) return cached;

    const value = await compute();
    await this.set(key, value);
    return value;
  }

  clear(): void {
    this.memory.clear();
    // Note: Redis keys are not cleared (they expire via TTL).
    // For explicit Redis invalidation, use delete() per key.
  }

  invalidatePrefix(prefix: string): void {
    this.memory.invalidatePrefix(prefix);
    // Redis keys expire via TTL — no prefix scan needed
  }
}
