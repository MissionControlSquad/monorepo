import { describe, it, expect } from "vitest";
import { isApiKeyActive, redactKey } from "@agentcenter/utils";
import { generateApiKey, hashApiKey } from "@/server/api-key";

// Epic #12: pure key helpers + hash discipline. No DB.

describe("isApiKeyActive", () => {
  const now = new Date("2026-07-13T00:00:00.000Z");

  it("a fresh key with no expiry is active", () => {
    expect(isApiKeyActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });
  it("a revoked key is inactive", () => {
    expect(isApiKeyActive({ revokedAt: new Date("2026-01-01"), expiresAt: null }, now)).toBe(false);
  });
  it("an expired key is inactive", () => {
    expect(
      isApiKeyActive({ revokedAt: null, expiresAt: new Date("2026-07-12T23:59:59Z") }, now),
    ).toBe(false);
  });
  it("a key expiring in the future is active", () => {
    expect(isApiKeyActive({ revokedAt: null, expiresAt: new Date("2026-08-01") }, now)).toBe(true);
  });
  it("expiry exactly at now is inactive (<=)", () => {
    expect(isApiKeyActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });
});

describe("redactKey", () => {
  it("appends a masked tail to the prefix", () => {
    expect(redactKey("mc_a1b2c3d4e")).toBe("mc_a1b2c3d4e••••••••");
  });
});

describe("api-key generation + hashing", () => {
  it("generates an mc_-prefixed key whose hash matches hashApiKey", () => {
    const { plainKey, hash, prefix } = generateApiKey();
    expect(plainKey.startsWith("mc_")).toBe(true);
    expect(prefix).toBe(plainKey.slice(0, 12));
    expect(hashApiKey(plainKey)).toBe(hash);
  });
  it("hashApiKey is deterministic and does not echo the plaintext", () => {
    const k = "mc_deadbeef";
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).not.toContain(k);
    expect(hashApiKey(k)).toHaveLength(64); // sha256 hex
  });
  it("two mints differ", () => {
    expect(generateApiKey().plainKey).not.toBe(generateApiKey().plainKey);
  });
});
