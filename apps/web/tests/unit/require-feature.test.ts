import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphQLError } from "graphql";

// Mock the feature-flags module
vi.mock("../../src/server/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));

import { isFeatureEnabled } from "../../src/server/feature-flags";
import { requireFeature } from "../../src/server/graphql/require-feature";

const mockIsEnabled = isFeatureEnabled as ReturnType<typeof vi.fn>;

describe("requireFeature", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
  });

  it("does not throw when feature is enabled", async () => {
    mockIsEnabled.mockResolvedValue(true);
    await expect(requireFeature("channels")).resolves.toBeUndefined();
  });

  it("throws GraphQLError when feature is disabled", async () => {
    mockIsEnabled.mockResolvedValue(false);

    await expect(requireFeature("cloud_vms")).rejects.toThrow(GraphQLError);
    await expect(requireFeature("cloud_vms")).rejects.toThrow("not available on your current plan");
  });

  it("includes FEATURE_DISABLED code in error extensions", async () => {
    mockIsEnabled.mockResolvedValue(false);

    try {
      await requireFeature("analytics");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      const gqlErr = err as GraphQLError;
      expect(gqlErr.extensions.code).toBe("FEATURE_DISABLED");
      expect(gqlErr.extensions.feature).toBe("analytics");
    }
  });

  it("passes the correct flag key to isFeatureEnabled", async () => {
    mockIsEnabled.mockResolvedValue(true);
    await requireFeature("recurring_tasks");
    expect(mockIsEnabled).toHaveBeenCalledWith("recurring_tasks");
  });
});
