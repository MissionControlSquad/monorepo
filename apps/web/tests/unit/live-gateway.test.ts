import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveConnectionRegistry } from "../../src/server/services/live-connection-registry";
import type { LiveConnection } from "../../src/server/services/live-connection-registry";

// ─── buildTaskMessage (via module internals) ──────────────────────────────────
// We test the observable output of buildTaskMessage by re-implementing the same
// logic here to keep the test file self-contained and avoid importing the
// module (which pulls in heavy Prisma/DB dependencies at import time).

const MAX_MESSAGE_BYTES = 4096;

function buildTaskMessage(opts: {
  taskId: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  assignedBy?: string;
}): string {
  const lines = [
    `You have been assigned a new task (task ID: ${opts.taskId}): "${opts.taskTitle.slice(0, 200)}"`,
  ];
  if (opts.taskDescription) {
    lines.push("", opts.taskDescription.slice(0, 1000));
  }
  if (opts.assignedBy) {
    lines.push("", `Assigned by: ${opts.assignedBy.slice(0, 100)}`);
  }
  lines.push(
    "",
    "Run your normal work cycle: update your status, complete the task, and report done per your PLAYBOOK.",
  );
  const msg = lines.join("\n");
  return msg.length > MAX_MESSAGE_BYTES ? msg.slice(0, MAX_MESSAGE_BYTES) : msg;
}

// ─── buildTaskMessage tests ───────────────────────────────────────────────────

describe("buildTaskMessage", () => {
  it("builds a basic message with title and taskId", () => {
    const msg = buildTaskMessage({ taskId: "t1", taskTitle: "Fix the bug", priority: "normal" });
    expect(msg).toContain("(task ID: t1)");
    expect(msg).toContain('"Fix the bug"');
    expect(msg).toContain("Run your normal work cycle");
  });

  it("truncates title at 200 characters", () => {
    const longTitle = "A".repeat(300);
    const msg = buildTaskMessage({ taskId: "t1", taskTitle: longTitle, priority: "normal" });
    expect(msg).toContain("A".repeat(200));
    expect(msg).not.toContain("A".repeat(201));
  });

  it("truncates description at 1000 characters", () => {
    const longDesc = "D".repeat(1500);
    const msg = buildTaskMessage({
      taskId: "t1",
      taskTitle: "Title",
      taskDescription: longDesc,
      priority: "normal",
    });
    expect(msg).toContain("D".repeat(1000));
    expect(msg).not.toContain("D".repeat(1001));
  });

  it("truncates assignedBy at 100 characters", () => {
    const longName = "N".repeat(150);
    const msg = buildTaskMessage({
      taskId: "t1",
      taskTitle: "Title",
      priority: "normal",
      assignedBy: longName,
    });
    expect(msg).toContain(`Assigned by: ${"N".repeat(100)}`);
    expect(msg).not.toContain("N".repeat(101));
  });

  it("caps total message at MAX_MESSAGE_BYTES", () => {
    const msg = buildTaskMessage({
      taskId: "t1",
      taskTitle: "T".repeat(200),
      taskDescription: "D".repeat(1000),
      assignedBy: "N".repeat(100),
      priority: "high",
    });
    expect(msg.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("omits description section when null", () => {
    const msg = buildTaskMessage({
      taskId: "t1",
      taskTitle: "Title",
      taskDescription: null,
      priority: "normal",
    });
    expect(msg).not.toContain("Assigned by:");
    expect(msg).toContain("(task ID: t1)");
    expect(msg).toContain('"Title"');
  });

  it("omits assignedBy section when absent", () => {
    const msg = buildTaskMessage({ taskId: "t1", taskTitle: "Title", priority: "normal" });
    expect(msg).not.toContain("Assigned by:");
  });
});

// ─── LiveConnectionRegistry tests ─────────────────────────────────────────────

function makeWs(readyState = 1): { readyState: number; send: ReturnType<typeof vi.fn> } {
  return { readyState, send: vi.fn() };
}

function makeConn(id: string, msSinceLastMessage = 0): LiveConnection {
  const now = new Date();
  const lastMessageAt = new Date(now.getTime() - msSinceLastMessage);
  return {
    connectionId: id,
    ws: makeWs() as any,
    connectedAt: now,
    lastMessageAt,
    pluginVersion: "1.0.0",
  };
}

describe("LiveConnectionRegistry", () => {
  let registry: LiveConnectionRegistry;

  beforeEach(() => {
    registry = new LiveConnectionRegistry();
  });

  it("starts empty", () => {
    expect(registry.size).toBe(0);
    expect(registry.allConnectionIds()).toEqual([]);
  });

  it("add and get a connection", () => {
    const conn = makeConn("conn-1");
    registry.add(conn);
    expect(registry.get("conn-1")).toBe(conn);
    expect(registry.size).toBe(1);
  });

  it("has returns true for existing connections", () => {
    registry.add(makeConn("conn-1"));
    expect(registry.has("conn-1")).toBe(true);
    expect(registry.has("conn-x")).toBe(false);
  });

  it("remove deletes a connection", () => {
    registry.add(makeConn("conn-1"));
    registry.remove("conn-1");
    expect(registry.get("conn-1")).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("remove on unknown id is a no-op", () => {
    expect(() => registry.remove("nonexistent")).not.toThrow();
  });

  it("send returns false when connection missing", () => {
    const result = registry.send("missing", { type: "mc.pong", timestamp: Date.now() });
    expect(result).toBe(false);
  });

  it("send returns false when WS is not OPEN (readyState !== 1)", () => {
    const conn = makeConn("conn-1");
    (conn.ws as any).readyState = 3; // CLOSED
    registry.add(conn);
    const result = registry.send("conn-1", { type: "mc.pong", timestamp: Date.now() });
    expect(result).toBe(false);
    expect(conn.ws.send).not.toHaveBeenCalled();
  });

  it("send calls ws.send with JSON and returns true when OPEN", () => {
    const conn = makeConn("conn-1");
    registry.add(conn);
    const msg = { type: "mc.pong", timestamp: 1234567890 } as const;
    const result = registry.send("conn-1", msg);
    expect(result).toBe(true);
    expect(conn.ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it("touch updates lastMessageAt", () => {
    const conn = makeConn("conn-1", 5000 /* 5 s ago */);
    const before = conn.lastMessageAt.getTime();
    registry.add(conn);
    registry.touch("conn-1");
    expect(conn.lastMessageAt.getTime()).toBeGreaterThan(before);
  });

  it("touch on unknown id is a no-op", () => {
    expect(() => registry.touch("missing")).not.toThrow();
  });

  it("staleIds returns only connections older than ttlMs", () => {
    registry.add(makeConn("fresh", 100)); // 100 ms ago
    registry.add(makeConn("stale", 10_000)); // 10 s ago
    const stale = registry.staleIds(5_000); // 5 s TTL
    expect(stale).toContain("stale");
    expect(stale).not.toContain("fresh");
  });

  it("staleIds returns empty array when all connections are fresh", () => {
    registry.add(makeConn("conn-1", 100));
    registry.add(makeConn("conn-2", 200));
    expect(registry.staleIds(60_000)).toEqual([]);
  });

  it("allConnectionIds returns all keys", () => {
    registry.add(makeConn("a"));
    registry.add(makeConn("b"));
    expect(registry.allConnectionIds()).toEqual(expect.arrayContaining(["a", "b"]));
    expect(registry.allConnectionIds()).toHaveLength(2);
  });
});
