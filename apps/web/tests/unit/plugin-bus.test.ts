import { describe, it, expect, vi } from "vitest";
import { EventBus, StreamBus } from "@agentcenter/utils";

describe("EventBus (#108)", () => {
  it("delivers to subscribers in order and supports unsubscribe", () => {
    const bus = new EventBus<{ ping: number }>();
    const seen: number[] = [];
    const off = bus.on("ping", (n) => seen.push(n));
    expect(bus.emit("ping", 1)).toBe(1);
    off();
    expect(bus.emit("ping", 2)).toBe(0); // no handlers → 0
    expect(seen).toEqual([1]);
  });

  it("once fires exactly once", () => {
    const bus = new EventBus<{ e: string }>();
    const fn = vi.fn();
    bus.once("e", fn);
    bus.emit("e", "a");
    bus.emit("e", "b");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("a throwing handler doesn't stop the others (error rethrown after)", () => {
    const bus = new EventBus<{ e: number }>();
    const after = vi.fn();
    bus.on("e", () => {
      throw new Error("boom");
    });
    bus.on("e", after);
    expect(() => bus.emit("e", 1)).toThrow("boom");
    expect(after).toHaveBeenCalledOnce();
  });
});

describe("StreamBus (#126)", () => {
  it("assigns monotonic per-topic seq and replays from a cursor", () => {
    const s = new StreamBus<string>();
    s.append("logs", "a");
    s.append("logs", "b");
    s.append("logs", "c");
    expect(s.latestSeq("logs")).toBe(3);
    expect(s.replay("logs").map((e) => e.payload)).toEqual(["a", "b", "c"]);
    expect(s.replay("logs", 2).map((e) => e.seq)).toEqual([3]);
  });

  it("subscribe with replayFrom catches up then streams live", () => {
    const s = new StreamBus<string>();
    s.append("t", "old");
    const got: string[] = [];
    s.subscribe("t", (e) => got.push(e.payload), 0);
    s.append("t", "new");
    expect(got).toEqual(["old", "new"]);
  });

  it("bounds retained entries but keeps seq advancing", () => {
    const s = new StreamBus<number>(2);
    for (const n of [1, 2, 3, 4]) s.append("t", n);
    expect(s.latestSeq("t")).toBe(4);
    // only the last 2 retained
    expect(s.replay("t").map((e) => e.payload)).toEqual([3, 4]);
  });
});
