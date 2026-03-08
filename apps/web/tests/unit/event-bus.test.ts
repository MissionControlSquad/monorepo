import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Since the event bus uses module-level state, we re-import fresh
 * copies for each test to avoid handler leakage between tests.
 */

// We test the bus in isolation by reimporting
let on: typeof import("../../src/server/events/bus").on;
let emit: typeof import("../../src/server/events/bus").emit;

beforeEach(async () => {
  // Reset modules to get a fresh handler map
  vi.resetModules();
  const bus = await import("../../src/server/events/bus");
  on = bus.on;
  emit = bus.emit;
});

describe("event bus", () => {
  it("calls registered handlers for matching event types", async () => {
    const handler = vi.fn();
    on("agent.joined" as any, handler);

    const event = { type: "agent.joined", agentId: "1", agentName: "Test" };
    await emit(event as any);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not call handlers for non-matching event types", async () => {
    const handler = vi.fn();
    on("agent.joined" as any, handler);

    await emit({ type: "task.created" } as any);

    expect(handler).not.toHaveBeenCalled();
  });

  it("calls multiple handlers in order", async () => {
    const order: number[] = [];
    on("agent.joined" as any, async () => { order.push(1); });
    on("agent.joined" as any, async () => { order.push(2); });

    await emit({ type: "agent.joined" } as any);

    expect(order).toEqual([1, 2]);
  });

  it("handles events with no registered handlers without error", async () => {
    await expect(emit({ type: "agent.joined" } as any)).resolves.toBeUndefined();
  });
});
