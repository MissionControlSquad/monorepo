import { describe, it, expect } from "vitest";
import { FLAG_KEYS, FLAG_DEFAULTS } from "@agentcenter/utils";
import type { FlagKey } from "@agentcenter/utils";

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
    expect(FLAG_KEYS.LIVE_GATEWAY).toBe("live_gateway");
    expect(FLAG_KEYS.GOVERNANCE).toBe("governance");
    expect(FLAG_KEYS.BUDGETS).toBe("budgets");
    expect(FLAG_KEYS.LEDGER).toBe("ledger");
    expect(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS).toBe("multi_provider_adapters");
    expect(FLAG_KEYS.SECRETS_VAULT).toBe("secrets_vault");
  });

  it("has exactly 14 flag keys", () => {
    expect(Object.keys(FLAG_KEYS)).toHaveLength(14);
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

  it("LIVE_GATEWAY defaults to false", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.LIVE_GATEWAY]).toBe(false);
  });

  it("MULTI_PROVIDER_ADAPTERS defaults to false (opt-in; OpenClaw always works)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.MULTI_PROVIDER_ADAPTERS]).toBe(false);
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
      FLAG_KEYS.GOVERNANCE,
      FLAG_KEYS.BUDGETS,
      FLAG_KEYS.LEDGER,
      FLAG_KEYS.SECRETS_VAULT,
    ];
    for (const key of expectedTrue) {
      expect(FLAG_DEFAULTS[key]).toBe(true);
    }
  });
});
