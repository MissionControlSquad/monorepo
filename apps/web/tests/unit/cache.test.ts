import { describe, it, expect, vi, afterEach } from "vitest";
import { TTLCache } from "../../src/server/cache";

describe("TTLCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves values", () => {
    const cache = new TTLCache<string>(60);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("returns undefined for missing keys", () => {
    const cache = new TTLCache<string>(60);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const cache = new TTLCache<string>(5); // 5 second TTL
    cache.set("key", "value");

    expect(cache.get("key")).toBe("value");

    vi.advanceTimersByTime(6_000);
    expect(cache.get("key")).toBeUndefined();
  });

  it("delete removes a key", () => {
    const cache = new TTLCache<string>(60);
    cache.set("key", "value");
    cache.delete("key");
    expect(cache.get("key")).toBeUndefined();
  });

  it("clear removes all keys", () => {
    const cache = new TTLCache<string>(60);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("invalidatePrefix removes matching keys", () => {
    const cache = new TTLCache<string>(60);
    cache.set("user:1", "alice");
    cache.set("user:2", "bob");
    cache.set("task:1", "task");

    cache.invalidatePrefix("user:");

    expect(cache.get("user:1")).toBeUndefined();
    expect(cache.get("user:2")).toBeUndefined();
    expect(cache.get("task:1")).toBe("task");
  });

  it("overwrites existing entries on set", () => {
    const cache = new TTLCache<string>(60);
    cache.set("key", "old");
    cache.set("key", "new");
    expect(cache.get("key")).toBe("new");
  });
});
