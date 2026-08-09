import { describe, it, expect } from "vitest";
import {
  nextPluginState,
  isPluginEffective,
  resolveGrantedCapabilities,
  requirePluginCapability,
  PluginLifecycleError,
  type PluginLifecycleState,
} from "@agentcenter/utils";

const installed: PluginLifecycleState = { status: "installed", enabled: true };

describe("plugin lifecycle (#114)", () => {
  it("disable → enable round-trip", () => {
    const disabled = nextPluginState(installed, "disable");
    expect(disabled).toEqual({ status: "disabled", enabled: false });
    expect(isPluginEffective(disabled)).toBe(false);
    const reenabled = nextPluginState(disabled, "enable");
    expect(isPluginEffective(reenabled)).toBe(true);
  });

  it("fail → error, and you must clear before enabling", () => {
    const errored = nextPluginState(installed, "fail");
    expect(errored).toEqual({ status: "error", enabled: false });
    expect(() => nextPluginState(errored, "enable")).toThrow(/clear the error/);
    const cleared = nextPluginState(errored, "clearError");
    expect(cleared).toEqual({ status: "installed", enabled: false }); // recovered but off
    expect(isPluginEffective(nextPluginState(cleared, "enable"))).toBe(true);
  });

  it("uninstall is terminal — no action may follow", () => {
    const removed = nextPluginState(installed, "uninstall");
    expect(removed.removed).toBe(true);
    expect(isPluginEffective(removed)).toBe(false);
    expect(() => nextPluginState(removed, "enable")).toThrow(PluginLifecycleError);
  });
});

describe("runtime capability grants (#103)", () => {
  it("grants are the intersection of declared and approved (least privilege)", () => {
    const res = resolveGrantedCapabilities(
      ["issues.read", "issues.create", "not-a-cap"],
      ["issues.read", "agents.invoke"], // agents.invoke approved but not declared → not granted
    );
    expect(res.granted).toEqual(["issues.read"]);
    expect(res.unknown).toEqual(["not-a-cap"]);
  });

  it("deny-by-default when nothing is approved", () => {
    expect(resolveGrantedCapabilities(["issues.read"]).granted).toEqual([]);
  });

  it("requirePluginCapability throws when not granted", () => {
    expect(() => requirePluginCapability(["issues.read"], "issues.read")).not.toThrow();
    expect(() => requirePluginCapability(["issues.read"], "issues.create")).toThrow(
      /lacks the 'issues.create'/,
    );
  });
});
