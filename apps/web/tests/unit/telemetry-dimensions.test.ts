import { describe, it, expect } from "vitest";
import { makeTelemetryEvent, type EventDimensionsMap } from "@agentcenter/utils";

/**
 * Typed telemetry dimensions (parity: EventDimensionsMap). This suite is a POSITIVE compile case:
 * a known event name pins `props` to its dimension shape, and an unknown name falls back to a free
 * record — both must compile AND behave. The negative case (an unknown dimension key is a *type*
 * error) is asserted with @ts-expect-error, which fails the build if it ever starts compiling.
 */
describe("makeTelemetryEvent typed dimensions", () => {
  it("accepts the exact dimensions for a known event (positive compile case)", () => {
    const e = makeTelemetryEvent({
      workspaceId: "ws1",
      name: "run.finished",
      props: { runId: "r1", agentId: "a1", durationMs: 1200 },
    });
    expect(e.name).toBe("run.finished");
    expect(e.props).toEqual({ runId: "r1", agentId: "a1", durationMs: 1200 });
    expect(e.retentionClass).toBe("product");
  });

  it("still accepts an unknown/dynamic event name with a free-form props record (non-breaking)", () => {
    const e = makeTelemetryEvent({
      workspaceId: "ws1",
      name: "some.dynamic.event",
      props: { anything: 1, goes: "here" },
    });
    expect(e.name).toBe("some.dynamic.event");
    expect(e.retentionClass).toBe("operational");
  });

  it("rejects an unknown dimension key on a known event at compile time", () => {
    const e = makeTelemetryEvent({
      workspaceId: "ws1",
      name: "tool.denied",
      // @ts-expect-error — `bogusDimension` is not a key of EventDimensionsMap["tool.denied"].
      props: { toolName: "shell", agentId: "a1", bogusDimension: true },
    });
    expect(e.name).toBe("tool.denied");
  });

  it("exposes the known event names in the map type", () => {
    // Compile-time: these keys must exist on EventDimensionsMap.
    const names: (keyof EventDimensionsMap)[] = ["run.started", "task.created", "tool.denied"];
    expect(names).toHaveLength(3);
  });
});
