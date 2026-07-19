import { describe, it, expect } from "vitest";
import { resolveExecutionTarget, describeExecutionTarget } from "@agentcenter/utils";

// Tier D / Phase 3 (Plan 6): the pure execution-target/transport resolver.
describe("resolveExecutionTarget", () => {
  it("local driver → in-process local", () => {
    expect(resolveExecutionTarget({ driver: "local" })).toEqual({
      kind: "local",
      transport: "local",
    });
  });

  it("sandbox driver on a cloud provider → remote sandbox", () => {
    expect(resolveExecutionTarget({ driver: "sandbox", providerKey: "e2b" })).toEqual({
      kind: "remote",
      transport: "sandbox",
      providerKey: "e2b",
    });
  });

  it("sandbox driver on the `local` provider stays in-process (local kind)", () => {
    const t = resolveExecutionTarget({ driver: "sandbox", providerKey: "local" });
    expect(t.kind).toBe("local");
    expect(t.transport).toBe("sandbox");
  });

  it("ssh + plugin drivers are remote", () => {
    expect(resolveExecutionTarget({ driver: "ssh" })).toMatchObject({
      kind: "remote",
      transport: "ssh",
    });
    expect(resolveExecutionTarget({ driver: "plugin" })).toMatchObject({
      kind: "remote",
      transport: "plugin",
    });
  });

  it("an unknown driver falls back to local", () => {
    expect(resolveExecutionTarget({ driver: "??" }).kind).toBe("local");
  });
});

describe("describeExecutionTarget", () => {
  it("labels a sandbox transport with its provider", () => {
    expect(
      describeExecutionTarget(resolveExecutionTarget({ driver: "sandbox", providerKey: "e2b" })),
    ).toBe("sandbox:e2b");
    expect(describeExecutionTarget(resolveExecutionTarget({ driver: "ssh" }))).toBe("ssh");
    expect(describeExecutionTarget(resolveExecutionTarget({ driver: "local" }))).toBe("local");
  });
});
