import { describe, it, expect } from "vitest";
import { FLAG_KEYS, FLAG_DEFAULTS } from "@agentcenter/utils";
import type { FlagKey } from "@agentcenter/utils";

describe("FLAG_KEYS", () => {
  it("contains all expected flag keys", () => {
    expect(FLAG_KEYS.CHANNELS).toBe("channels");
    expect(FLAG_KEYS.ANALYTICS).toBe("analytics");
    expect(FLAG_KEYS.RECURRING_TASKS).toBe("recurring_tasks");
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
    expect(FLAG_KEYS.PIPELINES_ROUTINES).toBe("pipelines_routines");
    expect(FLAG_KEYS.TASK_AUTONOMY).toBe("task_autonomy");
    expect(FLAG_KEYS.CASES).toBe("cases");
    expect(FLAG_KEYS.SKILLS_TEAMS).toBe("skills_teams");
    expect(FLAG_KEYS.WORKSPACE_PORTABILITY).toBe("workspace_portability");
    expect(FLAG_KEYS.GOALS).toBe("goals");
    expect(FLAG_KEYS.OBSERVABILITY).toBe("observability");
    expect(FLAG_KEYS.BOARD_CHAT).toBe("board_chat");
    expect(FLAG_KEYS.PLUGIN_SDK).toBe("plugin_sdk");
    expect(FLAG_KEYS.API_KEYS).toBe("api_keys");
    expect(FLAG_KEYS.TERMINALS).toBe("terminals");
    expect(FLAG_KEYS.AGENT_INSTRUCTIONS).toBe("agent_instructions");
    expect(FLAG_KEYS.ORG_CHART).toBe("org_chart");
    expect(FLAG_KEYS.ATTENTION).toBe("attention");
    expect(FLAG_KEYS.AGENT_AUTHZ).toBe("agent_authz");
    // Tier C subsystems
    expect(FLAG_KEYS.TASK_RELATIONS).toBe("task_relations");
    expect(FLAG_KEYS.EXTERNAL_LINKS).toBe("external_links");
    expect(FLAG_KEYS.ANNOTATIONS).toBe("annotations");
    expect(FLAG_KEYS.VOTING).toBe("voting");
    expect(FLAG_KEYS.MONITORS).toBe("monitors");
    // Tier D
    expect(FLAG_KEYS.RUNNERS).toBe("runners");
    expect(FLAG_KEYS.MEMORY).toBe("memory");
  });

  it("has exactly 41 flag keys", () => {
    expect(Object.keys(FLAG_KEYS)).toHaveLength(41);
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

  it("LIVE_GATEWAY defaults to false", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.LIVE_GATEWAY]).toBe(false);
  });

  it("MULTI_PROVIDER_ADAPTERS defaults to false (opt-in; OpenClaw always works)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.MULTI_PROVIDER_ADAPTERS]).toBe(false);
  });

  it("BOARD_CHAT defaults to false (experimental; operator opt-in)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.BOARD_CHAT]).toBe(false);
  });

  it("PLUGIN_SDK defaults to false (advanced extensibility; opt-in)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.PLUGIN_SDK]).toBe(false);
  });

  it("TERMINALS defaults to false (runtime/operator surface; opt-in)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.TERMINALS]).toBe(false);
  });

  it("RUNNERS defaults to false (Tier D execution surface; opt-in)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.RUNNERS]).toBe(false);
  });

  it("MEMORY defaults to false (Tier D memory layer; opt-in over stateless)", () => {
    expect(FLAG_DEFAULTS[FLAG_KEYS.MEMORY]).toBe(false);
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
      FLAG_KEYS.PIPELINES_ROUTINES,
      FLAG_KEYS.TASK_AUTONOMY,
      FLAG_KEYS.CASES,
      FLAG_KEYS.SKILLS_TEAMS,
      FLAG_KEYS.WORKSPACE_PORTABILITY,
      FLAG_KEYS.GOALS,
      FLAG_KEYS.OBSERVABILITY,
      FLAG_KEYS.API_KEYS,
      FLAG_KEYS.AGENT_INSTRUCTIONS,
      FLAG_KEYS.ORG_CHART,
      FLAG_KEYS.ATTENTION,
      FLAG_KEYS.AGENT_AUTHZ,
      FLAG_KEYS.TASK_RELATIONS,
      FLAG_KEYS.EXTERNAL_LINKS,
      FLAG_KEYS.ANNOTATIONS,
      FLAG_KEYS.VOTING,
      FLAG_KEYS.MONITORS,
    ]; // TERMINALS + PLUGIN_SDK + BOARD_CHAT + LIVE_GATEWAY + MULTI_PROVIDER_ADAPTERS + RUNNERS default false
    for (const key of expectedTrue) {
      expect(FLAG_DEFAULTS[key]).toBe(true);
    }
  });
});
