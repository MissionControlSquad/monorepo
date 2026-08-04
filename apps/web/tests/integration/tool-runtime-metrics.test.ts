import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  recordToolInvocation,
  toolRuntimeMetrics,
} from "../../src/server/services/tool-runtime-metrics";

// Parity #167 — tool runtime metrics.
const WS = "ws_toolmetrics";

beforeEach(async () => {
  await prisma.toolInvocation.deleteMany({ where: { workspaceId: WS } });
});

describe("tool runtime metrics (#167)", () => {
  it("validates outcome + toolName; drops errorKind for non-error outcomes", async () => {
    await expect(
      recordToolInvocation({ workspaceId: WS, toolName: "", outcome: "success" }),
    ).rejects.toThrow(/toolName/);
    await expect(
      recordToolInvocation({ workspaceId: WS, toolName: "x", outcome: "bogus" }),
    ).rejects.toThrow(/outcome/);
    const ok = await recordToolInvocation({
      workspaceId: WS,
      toolName: "x",
      outcome: "success",
      errorKind: "should-be-ignored",
    });
    expect(ok.errorKind).toBeNull();
  });

  it("aggregates per-tool: split, success rate, percentiles, error kinds", async () => {
    // http_get: 3 success (10/20/30ms), 1 error (timeout), 1 denied
    for (const d of [10, 20, 30]) {
      await recordToolInvocation({
        workspaceId: WS,
        toolName: "http_get",
        outcome: "success",
        durationMs: d,
      });
    }
    await recordToolInvocation({
      workspaceId: WS,
      toolName: "http_get",
      outcome: "error",
      durationMs: 500,
      errorKind: "timeout",
    });
    await recordToolInvocation({
      workspaceId: WS,
      toolName: "http_get",
      outcome: "denied",
      durationMs: 1,
    });
    // shell: 1 success — should sort AFTER http_get (fewer calls)
    await recordToolInvocation({
      workspaceId: WS,
      toolName: "shell",
      outcome: "success",
      durationMs: 5,
    });

    const metrics = await toolRuntimeMetrics(WS);
    expect(metrics.map((m) => m.toolName)).toEqual(["http_get", "shell"]);

    const http = metrics[0];
    expect(http.calls).toBe(5);
    expect(http.success).toBe(3);
    expect(http.error).toBe(1);
    expect(http.denied).toBe(1);
    expect(http.successRate).toBeCloseTo(0.6, 5);
    expect(http.p50DurationMs).toBe(20);
    expect(http.errorKinds).toEqual([{ kind: "timeout", count: 1 }]);
  });

  it("honors the time window (older invocations fall out)", async () => {
    const old = await recordToolInvocation({
      workspaceId: WS,
      toolName: "old_tool",
      outcome: "success",
    });
    // backdate it beyond a 1h window
    await prisma.toolInvocation.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 3 * 3_600_000) },
    });
    await recordToolInvocation({ workspaceId: WS, toolName: "new_tool", outcome: "success" });

    const recent = await toolRuntimeMetrics(WS, { sinceHours: 1 });
    expect(recent.map((m) => m.toolName)).toEqual(["new_tool"]);
    const all = await toolRuntimeMetrics(WS, { sinceHours: 24 });
    expect(all.map((m) => m.toolName).sort()).toEqual(["new_tool", "old_tool"]);
  });
});
