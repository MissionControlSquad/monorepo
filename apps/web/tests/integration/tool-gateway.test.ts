import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { admitToolCall, finalizeToolOutput } from "../../src/server/services/tool-gateway";
import { superviseToolRuntime } from "../../src/server/services/tool-runtime-supervisor";
import { setToolAccessPolicy } from "../../src/server/services/tool-access-policies";
import { setToolContentGuard } from "../../src/server/services/tool-content-guards";
import { registerPluginTool } from "../../src/server/services/plugin-tools";
import { enqueuePluginJob } from "../../src/server/services/plugin-jobs";

// Parity #164 (gateway) + #168 (supervisor).
const WS = "ws_gateway";

beforeEach(async () => {
  await Promise.all([
    prisma.toolAccessPolicy.deleteMany({ where: { workspaceId: WS } }),
    prisma.toolContentGuard.deleteMany({ where: { workspaceId: WS } }),
    prisma.pluginTool.deleteMany({ where: { workspaceId: WS } }),
    prisma.plugin.deleteMany({ where: { workspaceId: WS } }),
    prisma.pluginJob.deleteMany({ where: { workspaceId: WS } }),
    prisma.toolInvocation.deleteMany({ where: { workspaceId: WS } }),
  ]);
});

describe("tool gateway (#164)", () => {
  it("admits a plain built-in tool and records nothing as denied", async () => {
    const res = await admitToolCall({ workspaceId: WS, toolName: "echo", inputText: "hi" });
    expect(res).toMatchObject({ allowed: true, pluginId: null, guardedInput: "hi" });
  });

  it("denies a tool blocked by access policy (and records a denied invocation)", async () => {
    await setToolAccessPolicy({
      workspaceId: WS,
      toolPattern: "danger",
      effect: "deny",
      priority: 10,
    });
    const res = await admitToolCall({ workspaceId: WS, toolName: "danger" });
    expect(res).toMatchObject({ allowed: false, deniedBy: "access_policy" });
    expect(
      await prisma.toolInvocation.count({ where: { workspaceId: WS, outcome: "denied" } }),
    ).toBe(1);
  });

  it("denies input blocked by a content guard, and redacts otherwise", async () => {
    await setToolContentGuard({
      workspaceId: WS,
      pattern: "rm -rf",
      action: "deny",
      appliesTo: "input",
    });
    await setToolContentGuard({ workspaceId: WS, pattern: "password", action: "redact" });
    expect(
      (await admitToolCall({ workspaceId: WS, toolName: "shell", inputText: "rm -rf /" })).allowed,
    ).toBe(false);
    const ok = await admitToolCall({
      workspaceId: WS,
      toolName: "shell",
      inputText: "my password here",
    });
    expect(ok.allowed).toBe(true);
    expect(ok.guardedInput).toContain("[blocked]");
  });

  it("routes to a plugin tool only when the plugin is effective", async () => {
    await registerPluginTool({
      workspaceId: WS,
      pluginId: "acme",
      toolName: "acme.do",
      displayName: "Do",
    });
    // no Plugin row → not effective → denied
    expect((await admitToolCall({ workspaceId: WS, toolName: "acme.do" })).deniedBy).toBe(
      "plugin_disabled",
    );
    // install an effective plugin
    await prisma.plugin.create({
      data: {
        workspaceId: WS,
        pluginId: "acme",
        name: "Acme",
        version: "1.0.0",
        displayName: "Acme",
        category: "automation",
        manifest: {},
        status: "installed",
        enabled: true,
      },
    });
    const res = await admitToolCall({ workspaceId: WS, toolName: "acme.do" });
    expect(res).toMatchObject({ allowed: true, pluginId: "acme" });
  });

  it("finalizeToolOutput redacts output and records the completed invocation", async () => {
    await setToolContentGuard({
      workspaceId: WS,
      pattern: "secret",
      action: "redact",
      appliesTo: "output",
    });
    const out = await finalizeToolOutput({
      workspaceId: WS,
      toolName: "echo",
      outputText: "the secret is 42",
      durationMs: 12,
      outcome: "success",
    });
    expect(out.blocked).toBe(false);
    expect(out.outputText).toContain("[blocked]");
    expect(
      await prisma.toolInvocation.count({ where: { workspaceId: WS, outcome: "success" } }),
    ).toBe(1);
  });
});

describe("tool runtime supervisor (#168)", () => {
  it("reports queue health and reclaims stale leases", async () => {
    const job = await enqueuePluginJob({ workspaceId: WS, pluginId: "acme", jobKey: "x" });
    // simulate a dead worker holding a stale lease
    await prisma.pluginJob.update({
      where: { id: job.id },
      data: { status: "running", lockedAt: new Date(Date.now() - 20 * 60_000), lockedBy: "dead" },
    });
    const health = await superviseToolRuntime(WS);
    expect(health.reclaimedStale).toBe(1);
    expect(health.jobs.queued).toBe(1); // reclaimed back to queued
    expect(health.jobs.running).toBe(0);
    expect(health.healthy).toBe(true);
  });

  it("flags a degraded tool by success rate", async () => {
    // 4 calls, 1 success → 25% success rate → degraded
    await prisma.toolInvocation.createMany({
      data: [
        { workspaceId: WS, toolName: "flaky", outcome: "success", durationMs: 1 },
        { workspaceId: WS, toolName: "flaky", outcome: "error", durationMs: 1 },
        { workspaceId: WS, toolName: "flaky", outcome: "error", durationMs: 1 },
        { workspaceId: WS, toolName: "flaky", outcome: "error", durationMs: 1 },
      ],
    });
    const health = await superviseToolRuntime(WS, { reclaim: false });
    expect(health.degradedTools[0]).toMatchObject({ toolName: "flaky", calls: 4 });
    expect(health.healthy).toBe(false);
  });
});
