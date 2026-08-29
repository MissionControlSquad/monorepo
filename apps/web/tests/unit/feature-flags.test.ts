import { describe, it, expect, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  isFeatureEnabled,
  getAllFlags,
  setTestFeature,
  resetTestFeature,
  resetTestFeatures,
} from "../../src/server/feature-flags";

/**
 * The feature-flags module is buildbase-only in production. Under NODE_ENV=test it is driven by the
 * setTestFeature seam (replacing the removed local `feature_flags` table), DEFAULTING TO ON so suites
 * that don't touch flags see every feature enabled. This suite exercises that seam.
 */
describe("feature-flags test seam (buildbase-only module)", () => {
  beforeEach(() => resetTestFeatures());

  describe("isFeatureEnabled", () => {
    it("defaults every flag to ON when nothing is overridden", async () => {
      expect(await isFeatureEnabled(FLAG_KEYS.CHANNELS)).toBe(true);
      expect(await isFeatureEnabled("anything_unknown")).toBe(true);
    });

    it("honors an explicit disable and enable", async () => {
      setTestFeature(FLAG_KEYS.TERMINALS, false);
      expect(await isFeatureEnabled(FLAG_KEYS.TERMINALS)).toBe(false);
      setTestFeature(FLAG_KEYS.TERMINALS, true);
      expect(await isFeatureEnabled(FLAG_KEYS.TERMINALS)).toBe(true);
    });

    it("resetTestFeature returns a flag to the default ON", async () => {
      setTestFeature(FLAG_KEYS.TERMINALS, false);
      expect(await isFeatureEnabled(FLAG_KEYS.TERMINALS)).toBe(false);
      resetTestFeature(FLAG_KEYS.TERMINALS);
      expect(await isFeatureEnabled(FLAG_KEYS.TERMINALS)).toBe(true);
    });

    it("resetTestFeatures clears every override", async () => {
      setTestFeature(FLAG_KEYS.TERMINALS, false);
      setTestFeature(FLAG_KEYS.CHANNELS, false);
      resetTestFeatures();
      expect(await isFeatureEnabled(FLAG_KEYS.TERMINALS)).toBe(true);
      expect(await isFeatureEnabled(FLAG_KEYS.CHANNELS)).toBe(true);
    });
  });

  describe("getAllFlags", () => {
    it("returns every known FLAG_KEYS entry", async () => {
      const flags = await getAllFlags();
      expect(flags.map((f) => f.key).sort()).toEqual(Object.values(FLAG_KEYS).sort());
    });

    it("reflects overrides in the enabled field", async () => {
      setTestFeature(FLAG_KEYS.TERMINALS, false);
      const flags = await getAllFlags();
      expect(flags.find((f) => f.key === FLAG_KEYS.TERMINALS)?.enabled).toBe(false);
      expect(flags.find((f) => f.key === FLAG_KEYS.CHANNELS)?.enabled).toBe(true);
    });
  });
});
