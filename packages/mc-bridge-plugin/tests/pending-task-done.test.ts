import { describe, it, expect } from "vitest";
import { PendingTaskDone } from "../src/pending-task-done";
import type { MsgTaskDone } from "@agentcenter/types";

const frame = (slug: string, taskId: string): MsgTaskDone => ({
  type: "vm.task_done",
  slug,
  taskId,
  summary: null,
  timestamp: 1,
});

describe("PendingTaskDone", () => {
  it("tracks unacked completions and drops them on ack", () => {
    const p = new PendingTaskDone();
    p.add(frame("a", "t1"), 1000);
    p.add(frame("a", "t2"), 1000);
    expect(p.size).toBe(2);
    p.ack("a", "t1");
    expect(p.size).toBe(1);
    expect(p.due().map((f) => f.taskId)).toEqual(["t2"]);
  });

  it("is idempotent per (slug, taskId)", () => {
    const p = new PendingTaskDone();
    p.add(frame("a", "t1"), 1000);
    p.add(frame("a", "t1"), 2000);
    expect(p.size).toBe(1);
  });

  it("due() with no arg returns all (reconnect flush); with a cutoff returns only stale", () => {
    const p = new PendingTaskDone();
    p.add(frame("a", "old"), 1000);
    p.add(frame("a", "new"), 5000);
    expect(p.due().map((f) => f.taskId).sort()).toEqual(["new", "old"]);
    // only frames last-sent before 3000 are stale
    expect(p.due(3000).map((f) => f.taskId)).toEqual(["old"]);
  });

  it("markResent updates last-sent so a frame isn't resent every tick", () => {
    const p = new PendingTaskDone();
    const f = frame("a", "t1");
    p.add(f, 1000);
    expect(p.due(3000)).toHaveLength(1); // stale at t=3000
    p.markResent([f], 4000);
    expect(p.due(3000)).toHaveLength(0); // no longer stale relative to 3000
    expect(p.due(5000)).toHaveLength(1); // stale again later
  });

  it("an acked completion is not resent on the next flush", () => {
    const p = new PendingTaskDone();
    p.add(frame("a", "t1"), 1000);
    p.ack("a", "t1");
    expect(p.due()).toHaveLength(0);
  });
});
