import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @agentcenter/database — feature-flags.ts imports listAllFeatureFlags from it
const mockListAllFeatureFlags = vi.fn();

vi.mock("@agentcenter/database", () => ({
  listAllFeatureFlags: (...args: unknown[]) => mockListAllFeatureFlags(...args),
}));

// Mock the license module — in tests, all features are licensed and no license configured
vi.mock("../../src/server/license", () => ({
  isFeatureLicensed: vi.fn().mockResolvedValue(true),
  getLicenseStatus: vi.fn().mockResolvedValue({ status: "none" }),
}));

import {
  getFeatureFlags,
  isFeatureEnabled,
  getAllFlags,
  invalidateFlagCache,
} from "../../src/server/feature-flags";

const sampleFlags = [
  { key: "channels", enabled: true, managedBy: "system" as const, description: "Channels" },
  { key: "cloud_vms", enabled: false, managedBy: "system" as const, description: "Cloud VMs" },
  { key: "agent_queue", enabled: true, managedBy: "user" as const, description: "Agent Queue" },
];

describe("feature-flags server module", () => {
  beforeEach(() => {
    // This suite asserts the 60s cache behavior, so it must opt out of the test-wide fresh-read flag
    // (.env.test sets DISABLE_FLAG_CACHE=1 to avoid cross-file flag-cache flakiness elsewhere).
    delete process.env.DISABLE_FLAG_CACHE;
    vi.useFakeTimers();
    invalidateFlagCache();
    mockListAllFeatureFlags.mockReset();
    mockListAllFeatureFlags.mockResolvedValue(sampleFlags);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getFeatureFlags", () => {
    it("fetches flags from database on first call", async () => {
      const flags = await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledOnce();
      expect(flags.size).toBe(3);
      expect(flags.get("channels")?.enabled).toBe(true);
      expect(flags.get("cloud_vms")?.enabled).toBe(false);
    });

    it("returns cached flags on subsequent calls within TTL", async () => {
      await getFeatureFlags();
      await getFeatureFlags();
      await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledOnce();
    });

    it("refreshes cache after TTL expires", async () => {
      await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(61_000); // past the 60s TTL

      await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledTimes(2);
    });
  });

  describe("isFeatureEnabled", () => {
    it("returns true for enabled flag", async () => {
      expect(await isFeatureEnabled("channels")).toBe(true);
    });

    it("returns false for disabled flag", async () => {
      expect(await isFeatureEnabled("cloud_vms")).toBe(false);
    });

    it("defaults to true for unknown flag", async () => {
      expect(await isFeatureEnabled("nonexistent_flag")).toBe(true);
    });
  });

  describe("getAllFlags", () => {
    it("returns all flags as an array", async () => {
      const flags = await getAllFlags();
      expect(flags).toHaveLength(3);
      expect(flags.map((f) => f.key).sort()).toEqual(["agent_queue", "channels", "cloud_vms"]);
    });

    it("includes managedBy field", async () => {
      const flags = await getAllFlags();
      const agentQueue = flags.find((f) => f.key === "agent_queue");
      expect(agentQueue?.managedBy).toBe("user");
    });
  });

  describe("invalidateFlagCache", () => {
    it("forces a refresh on next access", async () => {
      await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledOnce();

      invalidateFlagCache();

      await getFeatureFlags();
      expect(mockListAllFeatureFlags).toHaveBeenCalledTimes(2);
    });

    it("picks up new data after invalidation", async () => {
      await getFeatureFlags();

      // Update mock to return different data
      mockListAllFeatureFlags.mockResolvedValue([
        { key: "channels", enabled: false, managedBy: "system", description: "Channels" },
      ]);

      invalidateFlagCache();

      const enabled = await isFeatureEnabled("channels");
      expect(enabled).toBe(false);
    });
  });
});
