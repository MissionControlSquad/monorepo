import { describe, it, expect } from "vitest";
import { FLAG_KEYS, FLAG_DEFAULTS } from "../../src/lib/feature-flag-keys";
import type { FlagKey } from "../../src/lib/feature-flag-keys";

describe("FLAG_KEYS", () => {
  it("contains all expected flag keys", () => {
    expect(FLAG_KEYS.CHANNELS).toBe("channels");
    expect(FLAG_KEYS.ANALYTICS).toBe("analytics");
    expect(FLAG_KEYS.RECURRING_TASKS).toBe("recurring_tasks");
    expect(FLAG_KEYS.CLOUD_VMS).toBe("cloud_vms");
    expect(FLAG_KEYS.REVIEWS).toBe("reviews");
    expect(FLAG_KEYS.DOCUMENTS).toBe("documents");
    expect(FLAG_KEYS.AGENT_QUEUE).toBe("agent_queue");
    expect(FLAG_KEYS.NOTIFICATIONS).toBe("notifications");
  });

  it("has exactly 8 flag keys", () => {
    expect(Object.keys(FLAG_KEYS)).toHaveLength(8);
  });

  it("all values are unique", () => {
    const values = Object.values(FLAG_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("FLAG_DEFAULTS", () => {
  it("has a default for every flag key", () => {
    for (const key of Object.values(FLAG_KEYS)) {
      expect(FLAG_DEFAULTS).toHaveProperty(key);
      expect(typeof FLAG_DEFAULTS[key as FlagKey]).toBe("boolean");
    }
  });

  it("CLOUD_VMS defaults to false", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.CLOUD_VMS]).toBe(false);
  });

  it("all other flags default to true", () => {
    const expectedTrue: FlagKey[] = [
      FLAG_KEYS.CHANNELS,
      FLAG_KEYS.ANALYTICS,
      FLAG_KEYS.RECURRING_TASKS,
      FLAG_KEYS.REVIEWS,
      FLAG_KEYS.DOCUMENTS,
      FLAG_KEYS.AGENT_QUEUE,
      FLAG_KEYS.NOTIFICATIONS,
    ];
    for (const key of expectedTrue) {
      expect(FLAG_DEFAULTS[key]).toBe(true);
    }
  });
});
