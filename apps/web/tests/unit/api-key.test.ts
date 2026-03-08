import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../../src/server/api-key";

describe("generateApiKey", () => {
  it("returns a plainKey starting with mc_", () => {
    const { plainKey } = generateApiKey();
    expect(plainKey).toMatch(/^mc_[a-f0-9]{64}$/);
  });

  it("returns a SHA-256 hash of the plain key", () => {
    const { plainKey, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(plainKey));
  });

  it("returns a prefix of 12 characters", () => {
    const { prefix, plainKey } = generateApiKey();
    expect(prefix).toHaveLength(12);
    expect(plainKey.startsWith(prefix)).toBe(true);
  });

  it("generates unique keys each time", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plainKey).not.toBe(b.plainKey);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  it("produces consistent hashes", () => {
    const key = "mc_test123";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("returns a 64-char hex string", () => {
    expect(hashApiKey("anything")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashApiKey("key1")).not.toBe(hashApiKey("key2"));
  });
});
