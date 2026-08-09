import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { scanSilentRuns, snoozeRunWatchdog } from "../../src/server/services/run-silence-watchdog";
import {
  armSubtreeWatchdog,
  reconcileSubtreeWatchdog,
  computeStopFingerprint,
  disarmSubtreeWatchdog,
} from "../../src/server/services/subtree-watchdog";
import { classifyOutputSilence } from "@agentcenter/utils";

const WS = "ws_watchdogs";
const MIN = 60_000;

beforeEach(async () => {
  await prisma.agentRun.deleteMany({ where: { workspaceId: WS } });
  await prisma.runWatchdogDecision.deleteMany({ where: { workspaceId: WS } });
  await prisma.subtreeWatchdog.deleteMany({ where: { workspaceId: WS } });
  await prisma.task.deleteMany({ where: { title: { startsWith: "wd-" } } });
});

describe("classifyOutputSilence (#10 pure)", () => {
  it("classifies ok/suspicious/critical and honors snooze", () => {
    const startedAt = new Date(0);
    expect(
      classifyOutputSilence({ lastOutputAt: new Date(0), startedAt, now: 1 * MIN }).state,
    ).toBe("ok");
    expect(
      classifyOutputSilence({ lastOutputAt: new Date(0), startedAt, now: 7 * MIN }).state,
    ).toBe("suspicious");
    expect(
      classifyOutputSilence({ lastOutputAt: new Date(0), startedAt, now: 20 * MIN }).state,
    ).toBe("critical");
    expect(
      classifyOutputSilence({
        lastOutputAt: new Date(0),
        startedAt,
        now: 20 * MIN,
        snoozedUntil: new Date(30 * MIN),
      }).state,
    ).toBe("snoozed");
  });
});

describe("scanSilentRuns (#10)", () => {
  it("flags a critically-silent running run and records a decision; snooze suppresses it", async () => {
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        kind: "task",
        status: "running",
        startedAt: new Date(Date.now() - 30 * MIN),
      },
    });
    const flags = await scanSilentRuns(WS);
    expect(flags.map((f) => f.runId)).toContain(run.id);
    expect(flags[0].state).toBe("critical");
    expect(await prisma.runWatchdogDecision.count({ where: { workspaceId: WS } })).toBe(1);

    await snoozeRunWatchdog(WS, run.id, new Date(Date.now() + 60 * MIN));
    expect(await scanSilentRuns(WS)).toHaveLength(0);
  });
});

describe("subtree watchdog (#9)", () => {
  it("computeStopFingerprint is stable + order-independent over terminal leaves", () => {
    const a = computeStopFingerprint([
      { id: "t1", status: "done" },
      { id: "t2", status: "cancelled" },
    ]);
    const b = computeStopFingerprint([
      { id: "t2", status: "cancelled" },
      { id: "t1", status: "done" },
    ]);
    expect(a).toBe(b);
    const c = computeStopFingerprint([{ id: "t1", status: "done" }]);
    expect(a).not.toBe(c);
  });

  it("wakes only when a fully-stopped subtree's fingerprint changes", async () => {
    const root = await prisma.task.create({
      data: { title: "wd-root", description: "d", status: "done", tags: [] },
    });
    const leaf = await prisma.task.create({
      data: { title: "wd-leaf", description: "d", status: "done", tags: [], parentTaskId: root.id },
    });
    const wd = await armSubtreeWatchdog({ workspaceId: WS, taskId: root.id });

    // first reconcile: stopped + new fingerprint → wake
    const r1 = await reconcileSubtreeWatchdog(WS, wd.id);
    expect(r1.stopped).toBe(true);
    expect(r1.shouldWake).toBe(true);
    // second reconcile, unchanged → no wake (suppressed)
    const r2 = await reconcileSubtreeWatchdog(WS, wd.id);
    expect(r2.shouldWake).toBe(false);

    // new work in the subtree (a leaf reopens) → not fully stopped → no wake
    await prisma.task.update({ where: { id: leaf.id }, data: { status: "in_progress" } });
    const r3 = await reconcileSubtreeWatchdog(WS, wd.id);
    expect(r3.stopped).toBe(false);
    expect(r3.shouldWake).toBe(false);

    expect(await disarmSubtreeWatchdog(WS, root.id)).toBe(true);
  });
});
